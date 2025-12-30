# Working with Redis Hashes: HSET and HINCRBY

Redis hashes are perfect for storing objects with multiple fields. Two essential commands for working with hashes are `HSET` and `HINCRBY`.

## HSET: Setting Hash Fields

`HSET` stores field-value pairs in a hash. It creates the hash if it doesn't exist and updates fields if they already exist.

**Syntax:**
```
HSET key field value [field value ...]
```

**Example:**
```redis
HSET user:1000 name "Alice" email "alice@example.com" age 30
```

This creates a hash at key `user:1000` with three fields. You can set multiple field-value pairs in one command or update them individually:

```redis
HSET user:1000 age 31
```

`HSET` returns the number of fields that were added (not updated).

## HINCRBY: Incrementing Hash Values

`HINCRBY` increments a numeric field in a hash by a specified amount. It's atomic and perfect for counters.

**Syntax:**
```
HINCRBY key field increment
```

**Example:**
```redis
HINCRBY user:1000 login_count 1
```

This increments the `login_count` field by 1. If the field doesn't exist, it's created and set to the increment value.

**Negative increments work too:**
```redis
HINCRBY user:1000 credits -50
```

`HINCRBY` only works with integer values. For floating-point numbers, use `HINCRBYFLOAT` instead.

## Common Use Cases

**User profiles with activity tracking:**
```redis
HSET user:2000 username "bob" email "bob@example.com"
HINCRBY user:2000 posts_count 1
HINCRBY user:2000 points 10
```

**Product inventory:**
```redis
HSET product:500 name "Widget" price 29.99
HINCRBY product:500 stock -1
```

## Why Use Hashes?

Hashes let you group related data under one key, making your data model cleaner and more efficient than using separate keys for each field. They're memory-efficient and allow you to retrieve or update individual fields without fetching the entire object.
