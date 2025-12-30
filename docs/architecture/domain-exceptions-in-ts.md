# Designing Domain Exceptions in TypeScript

**By Labeeb | Backend Engineer | Clean Architecture**

In layered architectures, domain or business exceptions must **not inherit from transport-specific exceptions** like HTTP exceptions. They represent **business rule violations**, not technical or transport failures.

---

## DomainException: Base Class for Business Errors

```ts
export abstract class DomainException extends Error {
  readonly abstract code: string;

  constructor(message: string) {
    super(message);

    // Fix prototype chain so `instanceof` works correctly
    Object.setPrototypeOf(this, new.target.prototype);

    // Set class name for stack traces and logging
    this.name = new.target.name;
  }
}
```

**Key points:**

* `extends Error` ensures compatibility with JS runtime and logging tools.
* `Object.setPrototypeOf(this, new.target.prototype)` fixes the broken inheritance when extending `Error`.
* `this.name = new.target.name` sets a meaningful class name in stack traces.
* `code` provides a **machine-readable identifier** for the exception.

---

## Example: ProductNotFound Exception

```ts
export class ProductNotFound extends DomainException {
  code: string = 'ProductNotFound';

  constructor(message: string) {
    super(message);
  }
}
```

**Why this matters:**

* The exception represents a **business invariant violation** (product missing).
* It is **transport-agnostic**: controllers, HTTP, gRPC, or message queues can handle it separately.
* Enables **clean architecture**, keeping domain logic independent from infrastructure.

---

### Summary

* **Domain exceptions** are for business rules, not HTTP or transport errors.
* **Base class** ensures consistent prototype chain, stack traces, and codes.
* **Subclasses** like `ProductNotFound` define specific domain errors while remaining reusable and testable.

This pattern makes your domain logic **predictable, maintainable, and decoupled** from the delivery layer.
