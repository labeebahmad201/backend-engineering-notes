# NestJS Service Layer Types - Best Practices

## The Problem

When your service methods return only specific fields from your database models, what type should you use? Should services return DTOs?

## The Solution: Domain Types, Not DTOs

**Services should return domain types, not DTOs.** DTOs belong to the transport layer (controllers), while services operate on domain concepts.

### Example Structure

```typescript
// domain/product.types.ts
export type Product = {
    id: string;
    sku: string;
    name: string;
    price: number;
    description?: string;
    imageUrl?: string;
};
```

```typescript
// catalog.service.ts
import { Product } from './domain/product.types';

@Injectable()
export class CatalogService {
    constructor(private readonly prisma: PrismaService) {}

    async findOne(sku: string): Promise<Product> {
        const product = await this.prisma.product.findUnique({
            where: { sku },
            select: {
                id: true,
                sku: true,
                name: true,
                price: true,
                description: true,
                imageUrl: true,
            }
        });

        if (!product) {
            throw new ProductNotFoundException(`${sku} not found`);
        }

        return product;
    }
}
```

```typescript
// dto/product-response.dto.ts
export class ProductResponseDto {
    id: string;
    sku: string;
    name: string;
    price: number;
    description?: string;
    imageUrl?: string;
}
```

```typescript
// catalog.controller.ts
@Controller('products')
export class CatalogController {
    constructor(private readonly catalogService: CatalogService) {}

    @Get(':sku')
    async findOne(@Param('sku') sku: string): Promise<ProductResponseDto> {
        return await this.catalogService.findOne(sku);
    }
}
```

## Layer Separation

| Layer | Type | Purpose |
|-------|------|---------|
| **Service** | Domain Type (`Product`) | Business logic and domain operations |
| **Controller** | DTO (`ProductResponseDto`) | HTTP transport and serialization |

### Why This Matters

- **Separation of Concerns**: Services shouldn't know about HTTP, REST, or GraphQL
- **Reusability**: Domain types can be used across different transport layers (REST, GraphQL, gRPC)
- **Flexibility**: DTOs and domain types can diverge independently (computed fields, formatting, etc.)
- **Testability**: Services remain transport-agnostic and easier to test

## When Types Diverge

If your API needs different data than your service provides, map between them in the controller:

```typescript
@Get(':sku')
async findOne(@Param('sku') sku: string): Promise<ProductResponseDto> {
    const product = await this.catalogService.findOne(sku);
    
    return {
        ...product,
        priceFormatted: `$${product.price.toFixed(2)}`, // DTO-specific field
    };
}
```

## Exception Handling: Return Types

When your service throws exceptions instead of returning `null`, reflect this in the return type:

```typescript
// ❌ Incorrect - suggests null can be returned
async findOne(sku: string): Promise<Product | null>

// ✅ Correct - method either returns Product or throws
async findOne(sku: string): Promise<Product>
```

The exception becomes part of your method's contract. Callers know that if the method returns, they have a valid `Product`.

## Summary

- Use **domain types** in services for business logic
- Use **DTOs** in controllers for transport concerns
- Let TypeScript infer when possible, but be explicit about contracts
- Throw exceptions for error cases; don't pollute return types with `null` unnecessarily
- Keep layers independent and focused on their responsibilities
