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
- `handlers/<feature>Handler.ts` — entry point; only instantiates repos and injects them into the UseCase. Create the UseCase out of the scope of the function / method, but in the same file. No business logic. One handler per feature (createUserHandler, updateUserHandler, paymentCheckoutHandler).
- `useCases/<feature>UseCase.ts` — pure business logic, no framework or concrete service dependencies. Use cases must never be consumed by other use cases under any circumstance. They only consume repositories. One use case per feature (createUserUseCase.ts, updateUserUseCase.ts, paymentCheckoutUseCase.ts).
- `repositories/<entity>Repository.ts` — adapters to external services (HTTP, DynamoDB, S3). Declared per module. If two or more modules can share a repository, it goes in `src/shared/repositories/`. One repository per entity and data source (usersRepository.ts, usersCacheRepository.ts, usersEventsRepository.ts).
- `repositories/interfaces/<entity>Repository.ts` — repository contracts; Use Cases depend on these interfaces, not on implementations.
- `dtos/` — API input/output types (wire format, separate from entities).
- `entities/` — domain models.

**`src/shared/`** — only genuinely reusable code across modules: configs, middlewares, shared DTOs, utils (logger, errors, parsers), shared repositories.

**`tests/unit/`** — unit tests in Jest. Interface mocks in `tests/mocks/`. Structure test following the same path that the file that is tested, in example, FOR: `src/modules/billing/providers/mobbexProvider.ts` set its tests in `tests/unit/modules/billing/providers/mobbexProvider.test.ts` 

## Coding practices

**Apply Clean Code principles**
**Apply SOLID principles**
**Use camel case starting with lower case for file names**: DO: completeOnboardingUseCase.ts, getUserProfileUseCase.ts. DONOT: completeOnboarding.use-case.ts, GetUserProfileUseCase.ts.
**DONOT use concrete architecture names, use abstract names instead**: DONOT: UserSupabaseRepository, AuthSnsRepository, CreateClerkUserUseCase. DO: UserDBRepository, AuthEventRepository, CreateUserUseCase.

## SQL Queries

**Use raw SQL for all database queries:** Use `postgres.js` tagged-template queries directly. Do not introduce ORMs, query builders, or other SQL abstraction libraries.
**Always use parameterized queries:** Use tagged template literals — never interpolate values directly into SQL strings to prevent SQL injection.
**Avoid `SELECT *`:** Select only the columns you need to reduce payload and avoid schema drift leaking unexpected fields.
**Validate before querying:** Sanitize and validate all external input at the boundary before it reaches the query.
**Wrap multi-step writes in transactions:** Any sequence of writes that must succeed or fail together must use `sql.begin(async (tx) => { ... })`.
**Keep queries in repositories:** No raw SQL in use cases or handlers — only in repository files.
**Always paginate unbounded queries:** Apply `LIMIT` and `OFFSET` (or cursor-based pagination) when querying collections.
**Log query latency:** Track duration at the repository layer for every external DB call.
**Enforce constraints at the DB level:** Do not rely solely on app-level validation — use `NOT NULL`, `UNIQUE`, `CHECK`, and `FK` constraints.
**Keep migrations separate from queries:** Schema changes belong in versioned migration files, not in application startup code.


## Comments

**Comments must be small**
**Add comments for understanding the domain and technical logic**

## Logging

**Use logger from `src/shared/infrastructure/logger.ts`**
**Add smart logs:** 
- Structured logging: consistent field names: timestamp, level, message, requestId, userId, duration
- What to log: Request in / response out (at the boundary); External calls (DB, HTTP, queue) with latency; Business-significant state transitions; All errors with stack traces
- What NOT to log: Secrets, tokens, passwords, PII (GDPR/compliance); High-frequency trivial events (tight loops); Redundant info already in the request context
- Enables reconstructing a full trace across services
- Include relevant IDs: "Payment failed" { userId, orderId, reason }
- Past tense for completed events: "User created"

## Config

**Add config files in `src/shared/configs/<scope>Config.ts`** 
**DONOT use the environment variables directly in the code**
**Use this structure for config files**
```ts
const env = process.env || {};

export const serviceConfig = {
    env: env.NODE_ENV,
    shortEnv: env.SHORT_ENV,
    selfUrl: env.SELF_URL || 'https://url.example.com/api'
};
```
