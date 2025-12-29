# Layered Architecture & Exception Handling Guide

A comprehensive guide to exception handling patterns in layered architecture for building maintainable, reusable systems.

---

## Table of Contents

- [Core Principles](#core-principles)
- [The Golden Rule](#the-golden-rule)
- [Layer Responsibilities](#layer-responsibilities)
- [Exception Flow](#exception-flow)
- [Design Patterns](#design-patterns)
- [Trade-offs](#trade-offs)
- [Real-World Examples](#real-world-examples)
- [Anti-Patterns](#anti-patterns)
- [Quick Reference](#quick-reference)

---

## Core Principles

### 1. Layers Depend on the Layer Below

```
Controller/Adapter
    ↓ depends on
Service/Domain
    ↓ depends on
Repository/Infrastructure
```

**Never reverse:** Domain should never import from Controller.

### 2. Domain Must Be Transport-Agnostic

The domain layer should not know about HTTP, CLI, queues, or any delivery mechanism.

```typescript
// ❌ Bad - domain knows about HTTP
throw new NotFoundException() // HTTP-specific

// ✅ Good - domain exception
throw new UserNotFound() // Pure domain
```

### 3. Fail Fast

Throw immediately when something is wrong. Don't continue execution in an invalid state.

```typescript
async createOrder(userId: string, productId: string) {
  const user = await this.getUser(userId)
  if (!user) throw new UserNotFound() // Stop immediately
  
  const product = await this.getProduct(productId)
  if (!product) throw new ProductNotFound() // Stop immediately
  
  // Happy path continues
  return this.orderRepo.create({ user, product })
}
```

### 4. Let Exceptions Bubble

Don't catch exceptions unless you're actually handling them. Let them propagate to the appropriate layer.

```typescript
// ❌ Bad - exception buried
try {
  await service.createOrder(data)
} catch (e) {
  console.log('Error:', e)
  // Exception dies here!
}

// ✅ Good - let it bubble
await service.createOrder(data)
```

---

## The Golden Rule

When to throw vs. return optional values:

> **If the caller could reasonably branch on the result** → return `null` / `Result`
>
> **If continuing execution would be incorrect** → throw

### Examples

**Return null for queries:**
```typescript
async findProduct(sku: string): Promise<Product | null> {
  return this.prisma.product.findUnique({ where: { sku } })
}
```

**Throw for commands:**
```typescript
async getProductOrThrow(sku: string): Promise<Product> {
  const product = await this.prisma.product.findUnique({ where: { sku } })
  if (!product) throw new ProductNotFound()
  return product
}
```

---

## Layer Responsibilities

### Repository Layer

**Responsibility:** Answer data questions

```typescript
class ProductRepository {
  async findById(id: string): Promise<Product | null> {
    return this.prisma.product.findUnique({ where: { id } })
  }
}
```

- Returns `null` for "not found"
- Throws infrastructure exceptions (DB errors, network timeouts)
- No business logic

### Service/Domain Layer

**Responsibility:** Enforce business rules and invariants

```typescript
class OrderService {
  async createOrder(userId: string, sku: string) {
    // Enforce invariants - throw if violated
    const user = await this.userService.getOrThrow(userId)
    const product = await this.productService.getOrThrow(sku)
    
    if (product.stock < 1) {
      throw new OutOfStock(sku)
    }
    
    return this.orderRepo.create({ user, product })
  }
}
```

- Throws domain exceptions when invariants are violated
- Does NOT catch its own exceptions (usually)
- May translate infrastructure exceptions to domain exceptions
- Transport-agnostic (doesn't know about HTTP/CLI)

### Controller/Adapter Layer

**Responsibility:** Translate between domain and external world

```typescript
@Post('/orders')
async createOrder(@Body() dto: CreateOrderDto) {
  try {
    const order = await this.orderService.createOrder(dto.userId, dto.sku)
    return { status: 201, data: order }
  } catch (e) {
    if (e instanceof UserNotFound) 
      throw new NotFoundException('User not found')
    if (e instanceof ProductNotFound) 
      throw new NotFoundException('Product not found')
    if (e instanceof OutOfStock) 
      throw new BadRequestException('Product out of stock')
    throw e
  }
}
```

- Catches domain exceptions
- Translates to transport responses (HTTP status codes, CLI exit codes, etc.)
- Validates input shape (not business rules)

### Global Exception Handler

**Responsibility:** Safety net for unhandled exceptions

```typescript
@Catch()
export class GlobalExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse()
    
    this.logger.error('Unhandled exception', exception)
    
    if (exception instanceof UserNotFound) {
      return response.status(404).json({ message: 'User not found' })
    }
    
    if (exception instanceof DatabaseError) {
      this.alerting.criticalError(exception)
    }
    
    return response.status(500).json({ message: 'Internal server error' })
  }
}
```

- Catches all unhandled exceptions
- Centralizes exception-to-HTTP mapping
- Logs and monitors
- Returns appropriate error responses

---

## Exception Flow

### Visual Flow

```
┌─────────────────────────────────────────────────┐
│ Client Request                                   │
└──────────────┬──────────────────────────────────┘
               │
               ↓
┌──────────────────────────────────────────────────┐
│ Controller/Adapter                               │
│ try {                                            │
│   service.createOrder()                          │ ← Catches & translates
│ } catch (DomainException) {                      │
│   → 404, 400, 409, etc.                         │
│ }                                                │
└──────────────┬───────────────────────────────────┘
               │
               ↓
┌──────────────────────────────────────────────────┐
│ Service/Domain                                   │
│ - Enforces invariants                            │
│ - Throws domain exceptions                       │ ← Throws, doesn't catch
│ - NO try-catch (unless translating)              │
└──────────────┬───────────────────────────────────┘
               │
               ↓
┌──────────────────────────────────────────────────┐
│ Repository/Infrastructure                        │
│ - DB errors, network errors                      │
│ - Throws infrastructure exceptions               │
└──────────────┬───────────────────────────────────┘
               │
               ↓ (if not caught in controller)
┌──────────────────────────────────────────────────┐
│ Global Exception Handler                         │
│ - Logs unexpected errors                         │ ← Safety net
│ - Returns 500                                    │
│ - Alerts monitoring                              │
└──────────────────────────────────────────────────┘
```

### Who Handles What?

| Exception Type | Usually Handled By | Alternative |
|----------------|-------------------|-------------|
| Domain exceptions | Controller or Global Handler | - |
| Database errors | Controller or Global Handler | Domain (if translating) |
| Network timeouts | Global Handler | Controller (if specific handling) |
| Validation errors | Domain (throws immediately) | - |
| Business rule violations | Domain (throws) | - |

---

## Design Patterns

### Pattern 1: Let Exceptions Bubble (Most Common)

```typescript
// Repository
class ProductRepository {
  async findById(id: string) {
    return this.prisma.product.findUnique({ where: { id } })
    // Can throw: PrismaClientKnownRequestError, NetworkError, etc.
  }
}

// Service - does NOT catch
class OrderService {
  async createOrder(productId: string) {
    const product = await this.productRepo.findById(productId)
    // If DB error happens, it just bubbles up
  }
}

// Controller - catches everything
try {
  await orderService.createOrder(productId)
} catch (e) {
  if (e instanceof ProductNotFound) throw new NotFoundException()
  if (e instanceof PrismaClientKnownRequestError) {
    throw new ServiceUnavailableException('Database error')
  }
  throw e
}
```

**When to use:** Most of the time. Simple, predictable, works well.

### Pattern 2: Translate at Domain Boundary

```typescript
// Service - translates infrastructure → domain
class OrderService {
  async createOrder(productId: string) {
    try {
      const product = await this.productRepo.findById(productId)
    } catch (e) {
      if (e instanceof PrismaClientKnownRequestError) {
        throw new ProductRepositoryError('Failed to fetch product')
      }
      throw e
    }
  }
}

// Controller - only handles domain errors
try {
  await orderService.createOrder(productId)
} catch (e) {
  if (e instanceof ProductRepositoryError) {
    throw new ServiceUnavailableException()
  }
  throw e
}
```

**When to use:** When you want to hide infrastructure details, or might swap implementations later.

### Pattern 3: Exception Mapper Helper

```typescript
// exception-mapper.ts
export class ExceptionMapper {
  static toHttp(error: Error): HttpException {
    if (error instanceof UserNotFound) 
      return new NotFoundException('User not found')
    if (error instanceof ProductNotFound) 
      return new NotFoundException('Product not found')
    if (error instanceof InsufficientStock) 
      return new BadRequestException('Out of stock')
    if (error instanceof DuplicateOrder) 
      return new ConflictException('Order exists')
    
    return new InternalServerErrorException()
  }
}

// Controller - clean
try {
  return await service.createOrder(data)
} catch (e) {
  throw ExceptionMapper.toHttp(e)
}
```

**When to use:** When you have many exception types and want centralized mapping.

### Pattern 4: Global Exception Filter (Recommended)

```typescript
// Service - just throws domain exceptions
class OrderService {
  async createOrder(data) {
    if (!user) throw new UserNotFound()
    if (!product) throw new ProductNotFound()
  }
}

// Controller - no try-catch at all!
@Post('/orders')
async createOrder(@Body() data: CreateOrderDto) {
  return await this.orderService.createOrder(data)
  // Let exceptions bubble to global filter
}

// Global filter - handles ALL exceptions
@Catch()
export class DomainExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse()
    
    if (exception instanceof UserNotFound) {
      return response.status(404).json({ message: 'User not found' })
    }
    if (exception instanceof ProductNotFound) {
      return response.status(404).json({ message: 'Product not found' })
    }
    
    return response.status(500).json({ message: 'Internal error' })
  }
}
```

**When to use:** Recommended for most applications. Keeps controllers clean, centralizes mapping.

### Pattern 5: Result Type (Functional Approach)

```typescript
type Result<T, E> = 
  | { ok: true; value: T } 
  | { ok: false; error: E }

// Service
async createOrder(userId: string): Promise<Result<Order, OrderError>> {
  const userResult = await this.userRepo.findById(userId)
  if (!userResult.ok) return { ok: false, error: 'UserNotFound' }
  
  return { ok: true, value: order }
}

// Controller
const result = await service.createOrder(userId)
if (!result.ok) {
  return this.handleError(result.error)
}
return result.value
```

**When to use:** Functional programming style, when you want explicit error handling, inspired by Rust/Go.

---

## Trade-offs

### The Core Trade-off

```
Option A: Domain throws generic/domain exceptions
  ✅ Domain is reusable across transports (HTTP, CLI, Queue)
  ❌ Controller must know all possible exceptions
  ❌ Controller does more work
  
Option B: Domain throws transport-specific exceptions
  ✅ Controller is simpler
  ❌ Domain is coupled to HTTP
  ❌ Can't reuse in non-HTTP contexts
```

### Decision Matrix

| Approach | Domain Work | Controller Work | Reusability | When to Use |
|----------|-------------|-----------------|-------------|-------------|
| Domain throws HTTP exceptions | Low | Low | ❌ Low | Simple apps, single transport |
| Domain throws + Controller catches | Medium | High | ✅ High | Multiple transports needed |
| Domain throws + Global filter | Medium | Low | ✅ High | **Recommended for most** |
| Result types | High | Medium | ✅ High | Functional style |

### Choosing Based on Context

**Single HTTP API:**
- Use global exception filter
- Trade-off: Worth it, clean controllers

**Multiple Transports (HTTP + CLI + Queue):**
- Domain throws pure exceptions
- Each adapter translates
- Trade-off: Worth it, true reusability

**Simple CRUD App:**
- Domain can throw HTTP exceptions directly
- Trade-off: Simplicity over "perfect" architecture

---

## Real-World Examples

### Example 1: E-commerce Order Creation

```typescript
// Domain exceptions
class UserNotFound extends Error {}
class ProductNotFound extends Error {}
class OutOfStock extends Error {}

// Repository
class ProductRepository {
  async findBySku(sku: string): Promise<Product | null> {
    return this.prisma.product.findUnique({ where: { sku } })
  }
}

// Service
class OrderService {
  async createOrder(userId: string, sku: string, quantity: number) {
    // Enforce invariants
    const user = await this.userRepo.findById(userId)
    if (!user) throw new UserNotFound(`User ${userId} not found`)
    
    const product = await this.productRepo.findBySku(sku)
    if (!product) throw new ProductNotFound(`Product ${sku} not found`)
    
    if (product.stock < quantity) {
      throw new OutOfStock(`Only ${product.stock} units available`)
    }
    
    // Happy path
    await this.productRepo.decrementStock(sku, quantity)
    return this.orderRepo.create({ userId, sku, quantity })
  }
}

// Controller
@Post('/orders')
async createOrder(@Body() dto: CreateOrderDto) {
  // Option 1: Handle in controller
  try {
    const order = await this.orderService.createOrder(
      dto.userId, 
      dto.sku, 
      dto.quantity
    )
    return { status: 201, data: order }
  } catch (e) {
    if (e instanceof UserNotFound) 
      throw new NotFoundException(e.message)
    if (e instanceof ProductNotFound) 
      throw new NotFoundException(e.message)
    if (e instanceof OutOfStock) 
      throw new BadRequestException(e.message)
    throw e
  }
  
  // Option 2: Let global filter handle it
  return await this.orderService.createOrder(
    dto.userId, 
    dto.sku, 
    dto.quantity
  )
}
```

### Example 2: Payment Processing

```typescript
// Domain
class PaymentService {
  async processPayment(orderId: string, amount: number) {
    const order = await this.orderRepo.findById(orderId)
    if (!order) throw new OrderNotFound()
    
    if (order.status === 'paid') {
      throw new OrderAlreadyPaid()
    }
    
    // Call external payment gateway
    try {
      const result = await this.paymentGateway.charge(amount)
      await this.orderRepo.markAsPaid(orderId, result.transactionId)
      return result
    } catch (e) {
      // Translate infrastructure error to domain error
      if (e instanceof GatewayTimeout) {
        throw new PaymentGatewayUnavailable()
      }
      if (e instanceof InsufficientFunds) {
        throw new PaymentDeclined('Insufficient funds')
      }
      throw new PaymentFailed('Payment processing failed')
    }
  }
}

// Controller
@Post('/payments')
async processPayment(@Body() dto: ProcessPaymentDto) {
  try {
    const result = await this.paymentService.processPayment(
      dto.orderId, 
      dto.amount
    )
    return { status: 200, data: result }
  } catch (e) {
    if (e instanceof OrderNotFound) 
      throw new NotFoundException('Order not found')
    if (e instanceof OrderAlreadyPaid) 
      throw new ConflictException('Order already paid')
    if (e instanceof PaymentDeclined) 
      throw new BadRequestException(e.message)
    if (e instanceof PaymentGatewayUnavailable) 
      throw new ServiceUnavailableException('Payment gateway unavailable')
    throw e
  }
}
```

### Example 3: User Registration

```typescript
// Domain
class UserService {
  async registerUser(email: string, password: string) {
    // Validate business rules
    if (!this.isValidEmail(email)) {
      throw new InvalidEmail('Email format is invalid')
    }
    
    if (password.length < 8) {
      throw new WeakPassword('Password must be at least 8 characters')
    }
    
    // Check uniqueness
    const existing = await this.userRepo.findByEmail(email)
    if (existing) {
      throw new UserAlreadyExists('Email already registered')
    }
    
    // Hash password and create user
    const hashedPassword = await this.hashPassword(password)
    return this.userRepo.create({ email, password: hashedPassword })
  }
  
  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  }
}

// Global Exception Filter
@Catch()
export class GlobalExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse()
    
    // Domain exceptions
    if (exception instanceof InvalidEmail) {
      return response.status(400).json({ 
        message: exception.message,
        field: 'email'
      })
    }
    
    if (exception instanceof WeakPassword) {
      return response.status(400).json({ 
        message: exception.message,
        field: 'password'
      })
    }
    
    if (exception instanceof UserAlreadyExists) {
      return response.status(409).json({ message: exception.message })
    }
    
    // Infrastructure exceptions
    if (exception instanceof DatabaseError) {
      this.logger.error('Database error', exception)
      return response.status(503).json({ 
        message: 'Service temporarily unavailable' 
      })
    }
    
    // Unknown exceptions
    this.logger.error('Unhandled exception', exception)
    return response.status(500).json({ message: 'Internal server error' })
  }
}

// Controller - stays clean
@Post('/register')
async register(@Body() dto: RegisterDto) {
  const user = await this.userService.registerUser(dto.email, dto.password)
  return { status: 201, data: user }
}
```

---

## Anti-Patterns

### ❌ Anti-Pattern 1: Swallowing Exceptions

```typescript
// BAD - exception is buried
try {
  await service.createOrder(data)
} catch (e) {
  console.log('Error:', e)
  // Exception dies here!
}

// GOOD - re-throw or handle
try {
  await service.createOrder(data)
} catch (e) {
  console.error('Failed to create order:', e)
  throw e // Let it bubble
}
```

### ❌ Anti-Pattern 2: Domain Knows About HTTP

```typescript
// BAD - domain coupled to HTTP
class OrderService {
  async createOrder(data) {
    if (!product) {
      throw new NotFoundException() // HTTP exception in domain!
    }
  }
}

// GOOD - domain exception
class OrderService {
  async createOrder(data) {
    if (!product) {
      throw new ProductNotFound() // Domain exception
    }
  }
}
```

### ❌ Anti-Pattern 3: Generic Error Messages

```typescript
// BAD - loses context
catch (e) {
  throw new Error('Something went wrong')
}

// GOOD - preserve context
catch (e) {
  if (e instanceof UserNotFound) {
    throw new NotFoundException('User not found')
  }
  throw e // Preserve original error
}
```

### ❌ Anti-Pattern 4: Catching Without Re-throwing

```typescript
// BAD - catch-all that hides errors
try {
  await doSomething()
} catch (e) {
  return null // Error information lost!
}

// GOOD - only catch what you handle
try {
  await doSomething()
} catch (e) {
  if (e instanceof SpecificError) {
    return null // Only this specific case
  }
  throw e // Re-throw everything else
}
```

### ❌ Anti-Pattern 5: Controller Contains Business Logic

```typescript
// BAD - business logic in controller
@Post('/orders')
async createOrder(@Body() dto: CreateOrderDto) {
  const product = await this.productRepo.findBySku(dto.sku)
  if (product.stock < dto.quantity) { // Business rule in controller!
    throw new BadRequestException('Out of stock')
  }
  // ...
}

// GOOD - business logic in service
@Post('/orders')
async createOrder(@Body() dto: CreateOrderDto) {
  return await this.orderService.createOrder(dto)
  // Service handles business rules
}
```

---

## Quick Reference

### When to Throw vs Return Null

| Situation | Action | Layer |
|-----------|--------|-------|
| Invariant violated | Throw domain exception | Service |
| Optional value | Return `null` or `Result` | Service |
| Infrastructure error (hide details) | Catch + translate to domain exception | Service |
| Infrastructure error (pass through) | Let it bubble | Service |
| Need HTTP response | Catch + translate to HTTP exception | Controller or Global Filter |
| Caught but not handling | **Re-throw** | Any |

### Exception Handling Checklist

- [ ] Domain exceptions are transport-agnostic
- [ ] Exceptions bubble to appropriate layer
- [ ] No exceptions are swallowed without logging
- [ ] Business logic is not in controllers
- [ ] Infrastructure details are hidden (if needed)
- [ ] Global exception handler is configured
- [ ] Error responses are consistent
- [ ] Exceptions include meaningful messages

### Common Domain Exceptions

```typescript
// Not Found
class UserNotFound extends Error {}
class ProductNotFound extends Error {}
class OrderNotFound extends Error {}

// Validation
class InvalidEmail extends Error {}
class WeakPassword extends Error {}
class InvalidQuantity extends Error {}

// Business Rules
class InsufficientStock extends Error {}
class OrderAlreadyPaid extends Error {}
class UserAlreadyExists extends Error {}

// External Systems
class PaymentFailed extends Error {}
class PaymentGatewayUnavailable extends Error {}
class InventoryServiceUnavailable extends Error {}
```

---

## Further Reading

### Architectural Patterns

- **Domain-Driven Design (DDD)** - Eric Evans
  - [Wikipedia Overview](https://en.wikipedia.org/wiki/Domain-driven_design)
  - Focus: Entities, Value Objects, Aggregates, and Invariants

- **Clean Architecture** - Robert C. Martin
  - [Blog Post](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)
  - Focus: Layered architecture with dependency rules

- **Hexagonal Architecture (Ports & Adapters)**
  - [Wikipedia](https://en.wikipedia.org/wiki/Hexagonal_architecture_(software))
  - Focus: Isolating business logic from interfaces

### Practical Resources

- [Understanding Clean Architecture and DDD](https://medium.com/bimar-teknoloji/understanding-clean-architecture-and-domain-driven-design-ddd-24e89caabc40)
- [Hexagonal Architecture with Examples](https://dev.to/dyarleniber/hexagonal-architecture-and-clean-architecture-with-examples-48oi)

### Framework-Specific

- **NestJS**: [Exception Filters Documentation](https://docs.nestjs.com/exception-filters)
- **Spring Boot**: `@ControllerAdvice` pattern
- **ASP.NET**: Exception Middleware
- **Express.js**: Error handling middleware

---

## License

This guide is released under the MIT License. Feel free to use, modify, and share.

## Contributing

Found an error or have a suggestion? Please open an issue or submit a pull request.

---

**Last Updated:** December 20
