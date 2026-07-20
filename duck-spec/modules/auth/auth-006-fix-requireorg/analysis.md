# AUTH-006 — Corregir la composición de `requireOrg` sobre `requireAuth`

## Reason for being

The `requireAuth` guard (`apps/services/src/shared/plugins/requireAuth.ts`) is registered as a Fastify `preHandler` on every authenticated route (`{ preHandler: requireAuth }`), so its signature is `(request, reply, done)`. `requireOrg` (`apps/services/src/shared/plugins/requireOrg.ts`) is meant to compose on top of `requireAuth` to additionally require organization scope, but it fell out of sync: it still invokes `requireAuth(request)` with a single argument. This breaks the backend build with a `TS2554` (wrong number of arguments) compilation error. The error is pre-existing and was not introduced by AUTH-005.

The goal is to restore the backend build (`tsc`) by fixing how `requireOrg` composes with `requireAuth`, while preserving the guard semantics: require an authenticated user and, in addition, a present organization scope.

## Scope

The requirements cover restoring backend compilation by fixing the argument mismatch between `requireOrg` and `requireAuth`, and preserving `requireOrg`'s three-way guard behavior (unauthenticated → 401, authenticated without organization → 403, authenticated with organization → continue). `requireOrg` is not currently wired to any route (confirmed: no references outside its own definition file), so this is a compile-fix to existing guard logic, not new route behavior.

## Out of scope

- Changing the behavior or the signature of `requireAuth`
- Changing which routes use `requireAuth` vs. `requireOrg`
- Adding new routes or wiring `requireOrg` to endpoints that do not use it today

## Functional requirements

| ID | EARS type | Statement |
|---|---|---|
| R001 | Ubiquitous | The system shall compile the backend (`tsc`) without producing the `TS2554` error currently caused by `requireOrg`'s call to `requireAuth`. |
| R002 | Conditional | IF `requireOrg` is invoked for a request without an authenticated user (`request.userId` is `undefined`), THEN the system shall reject the request with `UnauthorizedError` (HTTP 401). |
| R003 | Conditional | IF `requireOrg` is invoked for an authenticated request whose `request.orgId` is `null`, THEN the system shall reject the request with `ForbiddenError` (HTTP 403). |
| R004 | Conditional | IF `requireOrg` is invoked for an authenticated request whose `request.orgId` is present (non-`null`), THEN the system shall allow the request to continue to the next preHandler or route handler. |

## Non-functional requirements

| ID | Statement |
|---|---|
| NF001 | `requireOrg` shall not add perceptible latency relative to the current baseline, remaining an in-memory check over the already-decorated request. |

## Edge cases

| ID | Description |
|---|---|
| EC001 | WHEN `requireOrg` composes with `requireAuth` (whose own `done` callback signals Fastify to continue the preHandler chain) for an authenticated request whose `request.orgId` is `null`, the system shall throw `ForbiddenError` without having already signaled Fastify to proceed, so the request does not reach the route handler and no duplicate response is produced. |
| EC002 | WHEN `requireOrg` is invoked for a request that has neither an authenticated user nor an organization, the system shall respond with `UnauthorizedError` (401) only — the authentication check runs first and short-circuits before the organization check is evaluated. |

## Technical constraints

- `requireAuth`'s signature (`request: FastifyRequest, reply: FastifyReply, done: () => void`) must remain unchanged (per Out of scope).
- `requireOrg` is not currently registered as a `preHandler` on any route; the fix must not introduce new route wiring.
- The composition fix must account for `requireAuth`'s internal call to `done()` on the success path so that `requireOrg`'s organization check is evaluated, and can still reject with `ForbiddenError`, before Fastify is signaled to continue processing the request.
