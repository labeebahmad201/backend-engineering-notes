# Optimistic vs Pessimistic Locking

## Optimistic Locking

**No actual locks** - relies on detecting conflicts at commit time.

### How It Works
1. Multiple users read the same record
2. Each makes changes independently (no locks acquired)
3. On update, system checks if record changed since read
4. First commit wins, others get conflict error

### Example
```sql
-- Read with version number
SELECT id, name, price, version FROM products WHERE id = 1;
-- Returns: id=1, name='Widget', price=10.00, version=5

-- Update only if version matches (conflict detection)
UPDATE products 
SET price = 12.00, version = 6
WHERE id = 1 AND version = 5;

-- If 0 rows affected → conflict! Someone else updated first
```

### When to Use
- Updates are **infrequent**
- Locking overhead is high
- Conflicts are rare and acceptable

---

## Pessimistic Locking

**Actual locks** - prevents conflicts by blocking concurrent access.

### How It Works
1. User acquires lock before updating
2. Other users wait until lock is released
3. Updates are serialized (one after another)
4. No conflicts possible

### Example
```sql
-- Database-level lock (in transaction)
BEGIN TRANSACTION;
SELECT * FROM products WHERE id = 1 FOR UPDATE; -- Acquires lock
-- Other users are now blocked from this row
UPDATE products SET price = 12.00 WHERE id = 1;
COMMIT; -- Releases lock
```

### When to Use
- Updates are **frequent**
- Conflicts must be avoided
- Update operations are quick

---

## Lock Types

### Database Locks (Pessimistic)

**Row-level lock with transaction:**
```sql
BEGIN TRANSACTION;
SELECT * FROM accounts WHERE id = 1 FOR UPDATE;
UPDATE accounts SET balance = balance - 100 WHERE id = 1;
COMMIT;
```

**Atomic lock without transaction:**
```sql
-- Single UPDATE acquires and releases lock automatically
UPDATE accounts SET balance = balance - 100 WHERE id = 1;
```
Even without an explicit transaction, the database acquires a brief lock during the UPDATE operation to ensure atomicity.


## Quick Comparison

| Aspect | Optimistic | Pessimistic |
|--------|-----------|-------------|
| **Lock?** | No lock | Yes - actual lock |
| **Conflict** | Detected at commit | Prevented upfront |
| **Concurrency** | High | Lower |
| **Best for** | Read-heavy, rare conflicts | Write-heavy, must avoid conflicts |
| **Overhead** | Low | Higher (lock management) |

---

## Memory Aid

- **Optimistic** = "Hope for the best" (no lock, check later)
- **Pessimistic** = "Expect the worst" (lock first, prevent conflicts)
