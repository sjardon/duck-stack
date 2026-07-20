# SUBS-011 — Restaurar la testabilidad de `getMySubscriptionHandler`

## Problem statement

`getMySubscriptionHandler` instantiates `SubscriptionDBRepository` and `GetMySubscriptionUseCase` at module scope, so they are constructed at import time. Because the unit test's `jest.mock()` factories reference a `mockExecute` variable that jest hoists above the test file's own `const` declarations, importing the handler now triggers the mocked constructor before `mockExecute` is initialized, producing a temporal-dead-zone `ReferenceError` and failing the whole suite.

## Chosen solution

**Move dependency instantiation from module scope into the handler function body**

This satisfies R001 directly: once `new SubscriptionDBRepository(db)` and `new GetMySubscriptionUseCase(repo)` run only when `getMySubscriptionHandler` is invoked (not when the module is imported), the mocked constructors execute during the test's `await getMySubscriptionHandler(request, reply)` call — by which point `mockExecute` is already initialized — eliminating the TDZ error. R002, R003, R004, and EC001 are preserved unchanged because the use case call (`useCase.execute(request.userId!, request.orgId ?? null)`) and the reply shape (`{ subscription }`) are not touched, satisfying NF001 (no observable behavior change).

This mirrors the pattern already used by the majority of handlers in this same module — `cancelSubscriptionHandler`, `createSubscriptionHandler`, `getMyEntitlementsHandler`, and `getMyQuotasHandler` all instantiate their repository and use case inside the handler function body, per invocation. `getMySubscriptionHandler` and `listPlansHandler` are the only two outliers that construct at module scope, and `getMySubscriptionHandler` is precisely the one whose test this ticket must fix. Adopting the per-invocation pattern is therefore a convergence toward the module's dominant, already-tested convention rather than a new pattern.

**Note on convention tension:** `duck-spec/docs/BACKEND.md` ("Feature module structure" → "Layer rules") states use cases should be created "at module scope (outside the handler function), in the same file." This design deviates from that literal wording for `getMySubscriptionHandler` because: (a) the feature's technical constraint explicitly forbids module-load-time instantiation so the test can inject mocks, and (b) four of the six existing handlers in this same module already deviate from that documented wording and instantiate per-invocation without issue. Per-invocation instantiation is the pattern this module actually follows in practice; this design keeps `getMySubscriptionHandler` consistent with its siblings rather than special-casing it as the sole module-scope handler tied to a failing test. No other handler is touched by this change.

## Technical design

No data models, contracts, or API shapes change. The only change is *when* the two dependency objects are constructed:

- Before: `const repo = ...` / `const useCase = ...` at module top level, evaluated once at import time, reused across every request.
- After: `const repo = ...` / `const useCase = ...` declared as local `const`s at the top of the `getMySubscriptionHandler` function body, evaluated once per request.

Call sequence per request is otherwise identical: resolve `request.userId`/`request.orgId` → `useCase.execute(userId, orgId ?? null)` → `reply.send({ subscription })`.

## Files

| Path | Action | Description |
|---|---|---|
| `apps/services/src/modules/subscriptions/handlers/getMySubscriptionHandler.ts` | MODIFY | Move `SubscriptionDBRepository`/`GetMySubscriptionUseCase` instantiation from module scope into the handler function body, so dependencies are constructed per invocation instead of at import time. |

## Requirement coverage

| ID | Design decision |
|---|---|
| R001 | Instantiating `repo`/`useCase` inside the handler body defers construction of the mocked classes until the test calls `getMySubscriptionHandler(...)`, after `mockExecute` is initialized, removing the TDZ `ReferenceError`. |
| R002 | `useCase.execute(...)` call and `reply.send({ subscription })` are unchanged, so an existing subscription is still returned as `{ subscription }`. |
| R003 | Unchanged use-case call path still returns `{ subscription: null }` when the use case resolves no subscription. |
| R004 | `request.userId!` and `request.orgId ?? null` remain the arguments passed to `useCase.execute`, unchanged. |
| NF001 | Only the construction timing of `repo`/`useCase` changes; the function's inputs, outputs, and control flow are untouched. |
| EC001 | `request.orgId ?? null` (already present) continues to normalize an undefined `orgId` to `null` before calling the use case. |
