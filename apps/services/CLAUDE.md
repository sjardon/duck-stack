# BACKEND SERVICES

## Related documentation

Read `duck-spec/docs/BACKEND.md` for stack, error model, auth preHandlers, and webhook conventions.

## Project structure

The project uses **Hexagonal Architecture + Vertical Slicing**: each feature lives in a module under `src/modules/` containing all its layers. Dependencies flow inward:

```
Handler → UseCase → IRepository (implemented by) Repository
```

**`src/modules/<domain>/`** — one module per domain (auth, billing, subscriptions, etc). Each module contains:
- `routes.ts` — entry routes for each feature. Validates input data, enforces API contracts, implements security guards, etc. **Must be registered in `src/app.ts` as a Fastify plugin.**
- `handlers/<feature>Handler.ts` — entry point; only instantiates repos and injects them into the UseCase. No business logic. One handler per feature (createUserHandler, updateUserHandler, paymentCheckoutHandler).
- `useCases/<feature>UseCase.ts` — pure business logic, no framework or concrete service dependencies. Use cases must never be consumed by other use cases under any circumstance. They only consume repositories. One use case per feature (createUserUseCase.ts, updateUserUseCase.ts, paymentCheckoutUseCase.ts).
- `repositories/<entity>Repository.ts` — adapters to external services (HTTP, DynamoDB, S3). Declared per module. If two or more modules can share a repository, it goes in `src/shared/repositories/`. One repository per entity and data source (usersRepository.ts, usersCacheRepository.ts, usersEventsRepository.ts).
- `repositories/interfaces/<entity>Repository.ts` — repository contracts; Use Cases depend on these interfaces, not on implementations.
- `dtos/` — API input/output types (wire format, separate from entities).
- `entities/` — domain models.

**`src/shared/`** — only genuinely reusable code across modules: configs, middlewares, shared DTOs, utils (logger, errors, parsers), shared repositories.

**`tests/unit/`** — unit tests in Jest. Interface mocks in `tests/mocks/`.

## Coding conventions

**DONOT use concrete architecture names, use abstract names instead**: DONOT: UserSupabaseRepository, AuthSnsRepository, CreateClerkUserUseCase. DO: UserDBRepository, AuthEventRepository, CreateUserUseCase.
**Apply Clean Code principles**
**Apply SOLID principles**
**Comments must be small**
**Add comments only when necessary:** For understanding the domain logic or complex technical decisions.
**Add smart logs:** 
- Structured logging: consistent field names: timestamp, level, message, requestId, userId, duration
- What to log: Request in / response out (at the boundary); External calls (DB, HTTP, queue) with latency; Business-significant state transitions; All errors with stack traces
- What NOT to log: Secrets, tokens, passwords, PII (GDPR/compliance); High-frequency trivial events (tight loops); Redundant info already in the request context
- Enables reconstructing a full trace across services
- Include relevant IDs: "Payment failed" { userId, orderId, reason }
- Past tense for completed events: "User created"
