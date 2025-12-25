# Database Optimization: From Indexes to Partitioning  

When a table has no indexes, the database has no shortcuts. Every query forces it to scan all rows, which works at small scale but quickly becomes a bottleneck as data grows.  

But what is an index? It’s a data structure that lets the database find rows quickly, avoiding full table scans.

---

## Setup

In this lab, I will be using **PostgreSQL**. Make sure you have it installed and ready to use.  
I recommend using **[DBeaver](https://dbeaver.io/)** as the SQL client to connect to your database and run queries interactively.

---

## Create the Orders Table

First, I will create a simple `orders` table:

```sql
CREATE TABLE orders (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT,
    status TEXT,
    amount NUMERIC,
    created_at TIMESTAMP
);
```

## Seed the Table with Sample Data

Next, I will insert some sample data so I can see how queries behave without indexes:

```sql
INSERT INTO orders (user_id, status, amount, created_at)
SELECT
    (random() * 100)::int,
    CASE WHEN random() < 0.8 THEN 'completed' ELSE 'pending' END,
    random() * 500,
    now() - (random() * interval '30 days')
FROM generate_series(1, 1000);
```

## Run a Query Without an Index

Now I will run a query to find all orders for user_id = 42:

```sql
SELECT * FROM orders WHERE user_id = 42;
```
Since there is no index, PostgreSQL must check every row to find matching results. This is called a full table scan.

## Common developers mistake:
With only a few thousand rows, this might seem fine, which is why many developers test only on empty or small databases. To see the real performance impact, we will generate millions of rows in later steps, simulating a production-scale workload.

## Generate Millions of Records

To test performance realistically, I will generate **10 million orders**. This simulates a production-scale table where full table scans start to become painfully slow.

```sql
INSERT INTO orders (user_id, status, amount, created_at)
SELECT
    (random() * 100000)::int, -- user_id between 0 and 100,000
    CASE WHEN random() < 0.8 THEN 'completed' ELSE 'pending' END,
    random() * 500,
    now() - (random() * interval '365 days')
FROM generate_series(1, 10000000);
```
### Notes:

- user_id is spread across 100,000 users.
- status is 80% completed, 20% pending.
- created_at is randomly spread over the past year.
- generate_series(1, 10000000) creates 10 million rows.

This ensures our queries test realistic load, unlike small or empty databases.


To see exactly how PostgreSQL handles this large table, I use EXPLAIN ANALYZE:

```sql
EXPLAIN ANALYZE
SELECT * FROM orders WHERE user_id = 42;
```

Here is the output of EXPLAIN ANALYZE:

```
Gather  (cost=1000.00..146566.74 rows=98 width=44) (actual time=15.977..566.886 rows=113 loops=1)
  Workers Planned: 2
  Workers Launched: 2
  ->  Parallel Seq Scan on orders  (cost=0.00..145556.94 rows=41 width=44) (actual time=10.467..460.595 rows=38 loops=3)
        Filter: (user_id = 42)
        Rows Removed by Filter: 3333629
Planning Time: 0.175 ms
Execution Time: 566.946 ms
```



Let’s break it down:

- **`Gather`**: This node collects results from multiple parallel workers. We planned and launched 2 workers, so PostgreSQL splits the table and combines the rows found by each worker.

- **`Parallel Seq Scan on orders`**: Each worker performs a **sequential scan** on its portion of the table. Since there is **no index**, the worker must read all rows in its chunk. The filter `user_id = 42` is applied after reading each row.

- **`Rows Removed by Filter`**: Shows how many rows were read but didn’t match the filter. Each worker discarded millions of non-matching rows, which explains why the query is slow even with parallelism.

- **`actual time=10.467..460.595`**: For this worker, it took ~10.5 ms to return the first matching row, and ~460.6 ms to finish scanning all its assigned rows. The wide gap indicates that the **bulk of time is spent scanning non-matching rows**.

- **`Execution Time: 566.946 ms`**: This is the total time for the query including combining results from both workers. It’s noticeably slower than queries on small tables, showing the cost of scanning 10M rows without an index.

- **`cost=0.00..145556.94`**: Planner’s estimated cost to return the first row and all rows. While not in milliseconds, a large difference between start and end suggests the planner expects significant work.

- **`rows=41 (actual 38)`**: Estimated vs actual rows returned by each worker. Close numbers indicate the planner’s estimates are reasonably accurate.

- **`width=44`**: Average row size in bytes, which helps the planner estimate memory and I/O requirements.

**Key takeaway:** Without an index, **every row is read** even if only a few match. Parallelism helps, but the database still scans millions of rows. This makes `Seq Scan` a clear performance bottleneck, and it’s exactly what an index will fix.

## Optimize with a Single Index

To avoid scanning all 10 million rows, I will create an **index on `user_id`**. This allows PostgreSQL to jump directly to the matching rows.

```sql
CREATE INDEX idx_orders_user_id ON orders(user_id);
```

> Note: Creating an index on 10M rows may take a few seconds to a couple of minutes depending on your machine.


## Re-run the Query with the Index

Now, I rerun the same query:

```sql
EXPLAIN ANALYZE
SELECT * FROM orders WHERE user_id = 42;
```

## Step 13: Analyze the Optimized Query Output

After creating the index on `user_id`, the query now returns:

```
Bitmap Heap Scan on orders  (cost=5.19..388.90 rows=98 width=44) (actual time=0.092..0.258 rows=113 loops=1)
  Recheck Cond: (user_id = 42)
  Heap Blocks: exact=110
  ->  Bitmap Index Scan on idx_orders_user_id  (cost=0.00..5.17 rows=98 width=0) (actual time=0.050..0.050 rows=113 loops=1)
        Index Cond: (user_id = 42)
Planning Time: 0.174 ms
Execution Time: 0.294 ms
```

### Breakdown

- **`Bitmap Index Scan on idx_orders_user_id`**  
  - PostgreSQL scans the **index** first to find the matching `user_id = 42`.  
  - `Index Cond: (user_id = 42)` → filter is applied directly on the index.  
  - `actual time=0.050..0.050` → scanning the index is almost instantaneous.

- **`Bitmap Heap Scan on orders`**  
  - After the index identifies matching rows, PostgreSQL retrieves the actual table rows (heap) using a **bitmap of pointers**.  
  - `Recheck Cond: (user_id = 42)` → ensures the rows from the heap still satisfy the condition (safety check).  
  - `Heap Blocks: exact=110` → only 110 table blocks needed to fetch 113 rows, compared to millions previously.  
  - `actual time=0.092..0.258` → fetching the actual rows is very fast now.

- **`Planning Time: 0.174 ms`** → planner quickly decided the index plan.  
- **`Execution Time: 0.294 ms`** → total time dropped from ~566 ms to **less than 1 ms**.  

### Key Observations

- The database no longer performs a **full table scan**; instead, it jumps directly to the rows via the index.  
- Only the **relevant heap blocks** are accessed, drastically reducing I/O.  
- Even though this is a **Bitmap Heap Scan** (instead of a pure Index Scan), it’s still **orders of magnitude faster** than the previous sequential scan.  

**Takeaway:**  

- Adding an index on `user_id` transforms a slow query touching millions of rows into a near-instant lookup.  
- PostgreSQL smartly uses a **bitmap scan** to minimize disk reads when multiple rows match, balancing speed and efficiency.

## Explore Low-Cardinality Indexes

Some columns, like status with only a few possible values (completed, pending), have low cardinality.

Creating a standard index on low-cardinality columns may not help much.

You can test with:
```sql
CREATE INDEX idx_orders_status ON orders(status);
EXPLAIN ANALYZE
SELECT * FROM orders WHERE status = 'pending';
```

Observe whether PostgreSQL actually uses the index. Sometimes a sequential scan is faster for low-cardinality columns because the index doesn’t reduce row scanning significantly.

## Understanding Cost vs Actual Time in Queries

When we run `EXPLAIN ANALYZE`, PostgreSQL shows two important metrics:

```sql
Seq Scan on orders  (cost=0.00..218480.50 rows=2034870 width=44) (actual time=0.047..2097.477 rows=1999924 loops=1)
```
## Breakdown

### Cost

- cost=0.00..218480.50
    - 0.00 → estimated cost to return the first row
    - 218480.50 → estimated cost to return all rows

    Meaning: Planner’s prediction of work before executing the query
    Units: Relative units; not milliseconds or dollars

### Actual Time

- actual time=0.047..2097.477
    - 0.047 ms → time to return the first row
    - 2097.477 ms → time to return all rows

    Meaning: Measured time after execution, actual query duration

**Takeaway: Not every column deserves an index; analyze cardinality and query patterns first.
**

While point of indexing is skipping values that are not relevant but if a bunch of rows have same value then we skip x but y is then too much so we have to do full table scan. 


## Solution: Combine with a High-Cardinality Column

We can create a composite index on user_id (high cardinality) and status (low cardinality):

```sql
CREATE INDEX idx_orders_user_status
ON orders(user_id, status);
```
```
Index Scan using idx_orders_user_status on orders  (cost=0.43..84.83 rows=20 width=44) (actual time=1.641..11.025 rows=27 loops=1)
  Index Cond: ((user_id = 43) AND (status = 'pending'::text))
Planning Time: 3.779 ms
Execution Time: 11.071 ms
```
- Now the index first narrows down by user_id (selective) and then filters by status.
- Even though status alone is low cardinality, combining it with a selective column makes the index effective.

## Understanding Column Cardinality Queries in SQL

**1. Cardinality per User**

```sql
SELECT user_id, COUNT(*) AS cardinality
FROM orders
GROUP BY user_id
ORDER BY cardinality DESC;
```

## Cardinality per Status

```sql
SELECT COUNT(*) AS cardinality
FROM orders
GROUP BY status
ORDER BY cardinality DESC;
```

Whichever column has low cardinality, you can use that. 

## When composite indexes stop working
Even with (user_id, status) composite index, if a user has millions of orders, queries like WHERE user_id = 123 AND status = 'pending' still scan many rows for that user.

That tells us that we need to do query monitoring at the DB level cause most customers may not have that much data and for them queries may not be that slow.
But there may be customers with significant number of rows that DBMS decides to use full table scan and performance degrades for that user.




