# SUBS-010 — Variable-Cost Quota Strategies (backend)

## Reason for being

SUBS-006 models quotas as a counter that increments by `+1` for every request that passes through `requireQuota`. In practice, many services consume variable amounts per operation: a text-generation endpoint consumes N tokens, an upload consumes M bytes, and an email send consumes as many units as recipients. The current model either underestimates cost (a 1 GB upload counts the same as a 1 KB upload) or forces a per-request granularity that loses fidelity. Additionally, some costs are only knowable *after* the handler runs (e.g., tokens consumed by an LLM are determined by the model's response), which does not fit the current "check + atomic increment before the handler" pattern.

This feature extends SUBS-006 with a per-quota strategy registry that (1) computes cost from the request before the handler (mode `pre`), or (2) reserves a conservative worst-case cost before the handler and reconciles against the actual cost after the handler runs (mode `post`), preserving atomicity and idempotency under concurrency.

## Scope

Introduces a code-level `QuotaStrategy` mapping alongside the SUBS-006 thresholds mapping in `apps/services/src/modules/subscriptions/entitlements.ts`, extends the SUBS-006 `requireQuota` preHandler to consume that strategy for both `pre` and `post` modes, adds a `chargeQuota` helper for handlers to reconcile the reserved amount with the actual consumption in `post` mode, and augments the SUBS-006 `GET /billing/quotas/me` response with a `unit` field derived from each strategy. Shared types (`QuotaStrategy`, `QuotaMode`, `QuotaUnit`) are exported through `@repo/types` and `QuotaUsage` is extended with `unit`.

## Out of scope

- Persisting reservations in the database with a `reservation_id` (the reservation lives in request-scoped memory; if the process crashes between preHandler and `chargeQuota`, the reservation stands as the final cost).
- Automatic refund when the handler throws (the reservation remains booked; the developer may explicitly call `chargeQuota(request, name, 0)` inside an error handler for a full refund).
- Per-plan dynamic strategies (strategy is intrinsic to the quota; only thresholds in SUBS-006 vary by plan).
- Metrics or alerting for unreconciled reservations.
- Cost dependent on wall clock or external state (the strategy receives only the `FastifyRequest`).
- Reservation pooling across requests (each request reserves independently).
- Rollback of the increment when the preHandler returns 429 (SUBS-006 semantics preserved: `count` reflects attempts, not successful operations).

## Functional requirements

| ID | EARS type | Statement |
|---|---|---|
| R001 | Ubiquitous | The system shall define a mapping `quota_name → QuotaStrategy` of shape `{ unit: string, mode: 'pre' \| 'post', compute: (req: FastifyRequest) => number }` in `apps/services/src/modules/subscriptions/entitlements.ts` alongside the SUBS-006 thresholds mapping. |
| R002 | Conditional | IF a `quota_name` has no strategy registered, THEN the system shall apply the default strategy `{ unit: 'request', mode: 'pre', compute: () => 1 }` to preserve SUBS-006 legacy behavior. |
| R003 | Event-driven | WHEN a request reaches a handler protected by `requireQuota(name)`, the system shall resolve the strategy for `name`, invoke `compute(request)` to obtain the cost (mode `pre`) or reservation amount (mode `post`), and execute the SUBS-006 atomic upsert adding that value to `count` instead of `1`. |
| R004 | Event-driven | WHEN `requireQuota(name)` runs in mode `post`, the system shall decorate the request with `request.quotaReservations[name] = { reserved: number, charged: number }` where `charged = reserved` initially, so the handler can reconcile after execution. |
| R005 | Ubiquitous | The system shall export a helper `chargeQuota(request, name, actual: number)` from the subscriptions module, invocable from handlers running in mode `post`, that reads `request.quotaReservations[name]`, computes `delta = actual - reservation.charged`, executes an atomic `UPDATE usage_counters SET count = count + :delta` on the same row `(scope, quota_name, period_start)` resolved by the preHandler when `delta !== 0`, and sets `reservation.charged = actual`. |
| R006 | Conditional | IF `chargeQuota(request, name, actual)` is called and `request.quotaReservations[name]` does not exist, THEN the system shall throw a programming error (no `requireQuota` was applied for that quota). |
| R007 | Event-driven | WHEN `chargeQuota` is invoked more than once for the same quota within the same request, the system shall apply the delta of each call against the most recent `charged` value, supporting incremental charging inside the handler. |
| R008 | Conditional | IF the handler in mode `post` never invokes `chargeQuota`, THEN the system shall leave the initial reservation as the final booked cost (worst-case). |
| R009 | Conditional | IF `chargeQuota` is invoked with an `actual` value such that the resulting `count` exceeds `hard_limit`, THEN the system shall log a warning, persist the delta, and allow `count` to remain above `hard_limit` (the request already passed the preHandler check and cannot be rejected mid-handler). |
| R010 | Event-driven | WHEN `GET /billing/quotas/me` (from SUBS-006) responds, the system shall include a `unit` field in each quota entry, read from the strategy for that quota. |

## Non-functional requirements

| ID | Statement |
|---|---|
| NF001 | The system shall guarantee that `chargeQuota`'s reconciliation UPDATE is atomic (no prior read of the row) via `count = count + :delta`, preserving consistency under concurrent requests on the same `(scope, quota_name, period_start)` row. |
| NF002 | `requireQuota` in mode `pre` shall preserve SUBS-006 latency: exactly one query per request (no additional round trip compared with SUBS-006). |
| NF003 | `requireQuota` in mode `post` combined with `chargeQuota` shall add exactly one additional query per request (the reconciliation UPDATE) compared with SUBS-006. |

## Edge cases

| ID | Description |
|---|---|
| EC001 | WHEN `compute(request)` returns `0`, the system shall skip the SUBS-006 upsert entirely and shall not decorate `request.quotaReservations[name]` (free operations inside a quotable endpoint). |
| EC002 | WHEN `compute(request)` returns a negative number or a non-integer, the system shall throw `ValidationError` before touching the database. |
| EC003 | WHEN a `mode: 'post'` reservation returned by `compute(request)` alone exceeds `hard_limit`, the system shall reject the request with HTTP 429 and code `QUOTA_EXCEEDED` in the preHandler before the handler runs (identical semantics to SUBS-006). |
| EC004 | WHEN `chargeQuota(request, name, actual)` is called with `actual < 0`, the system shall throw `ValidationError` and shall not execute the UPDATE. |
| EC005 | WHEN a handler in mode `post` returns without invoking `chargeQuota` (early return, forgotten call, unreachable branch), the system shall keep the reservation as the final cost so the counter reflects the worst-case usage observable via `GET /billing/quotas/me`. |
| EC006 | WHEN `chargeQuota` is invoked for a quota whose strategy is `mode: 'pre'`, the system shall throw a programming error and shall not execute the UPDATE. |
| EC007 | WHEN a quota's strategy changes from `pre` to `post` (or vice versa) between deployments, the system shall continue to treat pre-existing rows in `usage_counters` as valid unit-total counters and shall not migrate or reset them (operators may revisit plan thresholds accordingly). |
| EC008 | WHEN `GET /billing/quotas/me` is called during an in-flight request in mode `post`, the system shall report the currently persisted `count` (reflecting the reservation or the latest `charged`), not the yet-unknown final `actual` — consistent with the endpoint's contract of returning the persisted snapshot. |
| EC009 | WHEN the same request triggers `requireQuota` for multiple distinct quotas in mode `post`, the system shall reconcile each independently through its own entry in `request.quotaReservations`. |

## Technical constraints

- Extends `apps/services/src/modules/subscriptions/entitlements.ts` (strategy mapping) and the SUBS-006 `requireQuota` preHandler; no new module is introduced.
- `chargeQuota` is exported from the subscriptions module and imported explicitly by handlers that run in mode `post`.
- Request-scoped reservation state lives on `request.quotaReservations`, decorated via `fastify.decorateRequest` with a `FastifyRequest` module augmentation declared in the same file that owns the preHandler.
- `chargeQuota`'s UPDATE uses the same `postgres.js` singleton and the same row identity `(scope, quota_name, period_start)` resolved by the preHandler; no ORM, query builder, or `@supabase/supabase-js` runtime dependency.
- Shared types `QuotaStrategy`, `QuotaMode` (`'pre' | 'post'`), and `QuotaUnit` are exported from `@repo/types`; `QuotaUsage` (from SUBS-006) is extended with `unit`.
- The strategy mapping is typed so the `QuotaName` union from SUBS-006 acts as the mandatory key set, preventing quotas without a strategy or an out-of-date default.

## Dependencies

- SUBS-006 — `requireQuota` preHandler, `usage_counters` table, `GET /billing/quotas/me` endpoint, plan-quotas thresholds mapping.
- SUBS-005 — pattern for the plan → config code-level mapping and shared-types export convention.

## Effort

**high**
