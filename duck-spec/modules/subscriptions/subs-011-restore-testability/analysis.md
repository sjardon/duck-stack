# SUBS-011 — Restaurar la testabilidad de `getMySubscriptionHandler`

## Reason for being

The `getMySubscriptionHandler` (in `apps/services/src/modules/subscriptions/handlers/getMySubscriptionHandler.ts`) began constructing its dependencies (the repository and the use case) at module level, so they are instantiated at import time. This breaks the mock setup of the unit test `getMySubscriptionHandler.test.ts`, which fails with a temporal-dead-zone `ReferenceError` (a variable accessed before its initialization). The failure is pre-existing and was not introduced by AUTH-005.

The goal is to fix the failing unit test by restoring the handler's dependency resolution so it is mockable, without altering the handler's observable behavior.

## Scope

Refactor how `getMySubscriptionHandler` resolves its repository and use-case dependencies so they are no longer instantiated at import time, making them mockable from the unit test. The handler must keep returning the authenticated user's current subscription (or `null` when none exists), resolved from the request's user and organization. This is a testability-only refactor with no functional change.

## Out of scope

- Changing the shape of the endpoint response
- Changing the logic of the `GetMySubscriptionUseCase` use case
- Modifying other handlers of the `subscriptions` module

## Functional requirements

| ID | EARS type | Statement |
|---|---|---|
| R001 | Event-driven | WHEN the `getMySubscriptionHandler` unit test suite is executed the system shall pass every test case in `getMySubscriptionHandler.test.ts` without a temporal-dead-zone `ReferenceError`. |
| R002 | Event-driven | WHEN an authenticated user with an existing subscription calls the handler the system shall respond with `{ subscription }` containing that user's current subscription. |
| R003 | Conditional | IF the authenticated user has no subscription, THEN the system shall respond with `{ subscription: null }`. |
| R004 | Ubiquitous | The system shall resolve the subscription using the request's user (`request.userId`) and organization (`request.orgId`). |

## Non-functional requirements

| ID | Statement |
|---|---|
| NF001 | The observable behavior of the endpoint (response shape, status, and payload) shall remain identical to the current implementation. |

## Edge cases

| ID | Description |
|---|---|
| EC001 | WHEN the authenticated request has no organization (`request.orgId` is undefined) the system shall resolve the subscription with the organization argument passed as `null`. |

## Technical constraints

- Dependency instantiation (`SubscriptionDBRepository` and `GetMySubscriptionUseCase`) must not run at module import time, so the unit test can inject mocks before the handler resolves its dependencies.
