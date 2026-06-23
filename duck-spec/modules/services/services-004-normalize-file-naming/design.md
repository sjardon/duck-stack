# SERVICES-004 — Normalize file naming to lowercase camelCase

## Problem statement

`apps/services/src/` contains files that violate the project's established naming convention (lowercase camelCase, no dot-separated suffixes, no hyphens). Plugin files use kebab-case and a `.plugin.ts` suffix, entity files carry a `.entity.ts` suffix, and DTO files carry a `.dto.ts` suffix. The inconsistency hinders file discovery, makes naming criteria negotiable per file, and blocks future automated convention audits.

## Chosen solution

**Atomic rename-and-update**

Rename all 11 offending files to lowercase camelCase, then update every `import` statement that references those old names — in both source and test files — to point to the new names. No class, function, interface, or type name inside any file is altered. This is the only viable strategy because there is exactly one required outcome (R001–R003) and the sole risk is broken imports (R004, EC002).

The solution satisfies R001 (plugins renamed without hyphens or `.plugin.ts`), R002 (entity files renamed without `.entity.ts`), R003 (DTO files renamed without `.dto.ts`), R004 (all import paths updated), R005 (no logic changes mean behavior is identical), and R006 (test logic untouched, only import paths updated). It also satisfies NF001 (zero non-`.ts`/`.test.ts` dots or hyphens remain) and NF002 (each rename is a discrete, similarity-detectable git operation).

## Technical design

This feature is a pure filesystem and import-path refactor. There are no new data models, API contracts, or runtime behaviors introduced.

### Rename mapping

| Old path (relative to `apps/services/src/`) | New path |
|---|---|
| `shared/plugins/error-handler.ts` | `shared/plugins/errorHandler.ts` |
| `shared/plugins/clerk-auth.plugin.ts` | `shared/plugins/clerkAuthPlugin.ts` |
| `shared/plugins/require-auth.ts` | `shared/plugins/requireAuth.ts` |
| `shared/plugins/require-org.ts` | `shared/plugins/requireOrg.ts` |
| `modules/billing/entities/transaction.entity.ts` | `modules/billing/entities/transactionEntity.ts` |
| `modules/billing/entities/refund.entity.ts` | `modules/billing/entities/refundEntity.ts` |
| `modules/billing/dtos/checkout.dto.ts` | `modules/billing/dtos/checkoutDto.ts` |
| `modules/subscriptions/entities/subscriptionPlan.entity.ts` | `modules/subscriptions/entities/subscriptionPlanEntity.ts` |
| `modules/users/entities/user.entity.ts` | `modules/users/entities/userEntity.ts` |
| `modules/users/dtos/completeOnboarding.dto.ts` | `modules/users/dtos/completeOnboardingDto.ts` |
| `modules/users/dtos/updateProfile.dto.ts` | `modules/users/dtos/updateProfileDto.ts` |

### Import update map

After each file is renamed, every `import` referencing the old `.js` specifier must be updated to use the new name. The full set of callers:

| Renamed file | Files whose imports must be updated |
|---|---|
| `errorHandler.ts` | `src/app.ts` |
| `clerkAuthPlugin.ts` | `src/app.ts` |
| `requireAuth.ts` | `src/modules/billing/routes.ts`, `src/modules/users/routes.ts`, `src/shared/plugins/requireOrg.ts` |
| `requireOrg.ts` | (no callers in current codebase) |
| `transactionEntity.ts` | `src/modules/billing/repositories/interfaces/iTransactionRepository.ts`, `src/modules/billing/repositories/transactionDBRepository.ts`, `src/modules/billing/useCases/getTransactionUseCase.ts`, `tests/unit/billing/checkoutUseCase.test.ts`, `tests/unit/billing/getRefundsUseCase.test.ts`, `tests/unit/billing/getTransactionUseCase.test.ts`, `tests/unit/billing/listTransactionsUseCase.test.ts`, `tests/unit/billing/transactionDBRepository.test.ts` |
| `refundEntity.ts` | `src/modules/billing/repositories/interfaces/iTransactionRepository.ts`, `src/modules/billing/repositories/transactionDBRepository.ts`, `src/modules/billing/useCases/getRefundsUseCase.ts`, `tests/unit/billing/getRefundsUseCase.test.ts`, `tests/unit/billing/transactionDBRepository.test.ts` |
| `checkoutDto.ts` | `src/modules/billing/handlers/checkoutHandler.ts`, `src/modules/billing/handlers/listTransactionsHandler.ts`, `src/modules/billing/useCases/checkoutUseCase.ts`, `tests/unit/billing/checkoutUseCase.test.ts` |
| `subscriptionPlanEntity.ts` | `src/modules/subscriptions/repositories/interfaces/iSubscriptionPlanRepository.ts`, `src/modules/subscriptions/repositories/subscriptionPlanDBRepository.ts`, `src/modules/subscriptions/useCases/listPlansUseCase.ts`, `tests/unit/modules/subscriptions/listPlansHandler.test.ts`, `tests/unit/modules/subscriptions/listPlansUseCase.test.ts`, `tests/unit/modules/subscriptions/subscriptionPlanDBRepository.test.ts` |
| `userEntity.ts` | (no src/test callers found; file is standalone) |
| `completeOnboardingDto.ts` | `src/modules/users/handlers/completeOnboardingHandler.ts` |
| `updateProfileDto.ts` | `src/modules/users/handlers/updateUserProfileHandler.ts` |

### Execution order

Rename operations are independent of each other. However, `requireOrg.ts` imports from `requireAuth.ts`, so `requireAuth.ts` must be renamed and its callers updated before the import inside `requireOrg.ts` is patched (though the file rename of `requireOrg.ts` itself can happen in any order).

## Files

| Path | Action | Description |
|---|---|---|
| `apps/services/src/shared/plugins/error-handler.ts` | DELETE | Replaced by `errorHandler.ts` |
| `apps/services/src/shared/plugins/errorHandler.ts` | CREATE | Rename of `error-handler.ts`; content identical |
| `apps/services/src/shared/plugins/clerk-auth.plugin.ts` | DELETE | Replaced by `clerkAuthPlugin.ts` |
| `apps/services/src/shared/plugins/clerkAuthPlugin.ts` | CREATE | Rename of `clerk-auth.plugin.ts`; content identical |
| `apps/services/src/shared/plugins/require-auth.ts` | DELETE | Replaced by `requireAuth.ts` |
| `apps/services/src/shared/plugins/requireAuth.ts` | CREATE | Rename of `require-auth.ts`; content identical |
| `apps/services/src/shared/plugins/require-org.ts` | DELETE | Replaced by `requireOrg.ts` |
| `apps/services/src/shared/plugins/requireOrg.ts` | CREATE | Rename of `require-org.ts`; import path for `requireAuth` updated |
| `apps/services/src/modules/billing/entities/transaction.entity.ts` | DELETE | Replaced by `transactionEntity.ts` |
| `apps/services/src/modules/billing/entities/transactionEntity.ts` | CREATE | Rename of `transaction.entity.ts`; content identical |
| `apps/services/src/modules/billing/entities/refund.entity.ts` | DELETE | Replaced by `refundEntity.ts` |
| `apps/services/src/modules/billing/entities/refundEntity.ts` | CREATE | Rename of `refund.entity.ts`; content identical |
| `apps/services/src/modules/billing/dtos/checkout.dto.ts` | DELETE | Replaced by `checkoutDto.ts` |
| `apps/services/src/modules/billing/dtos/checkoutDto.ts` | CREATE | Rename of `checkout.dto.ts`; content identical |
| `apps/services/src/modules/subscriptions/entities/subscriptionPlan.entity.ts` | DELETE | Replaced by `subscriptionPlanEntity.ts` |
| `apps/services/src/modules/subscriptions/entities/subscriptionPlanEntity.ts` | CREATE | Rename of `subscriptionPlan.entity.ts`; content identical |
| `apps/services/src/modules/users/entities/user.entity.ts` | DELETE | Replaced by `userEntity.ts` |
| `apps/services/src/modules/users/entities/userEntity.ts` | CREATE | Rename of `user.entity.ts`; content identical |
| `apps/services/src/modules/users/dtos/completeOnboarding.dto.ts` | DELETE | Replaced by `completeOnboardingDto.ts` |
| `apps/services/src/modules/users/dtos/completeOnboardingDto.ts` | CREATE | Rename of `completeOnboarding.dto.ts`; content identical |
| `apps/services/src/modules/users/dtos/updateProfile.dto.ts` | DELETE | Replaced by `updateProfileDto.ts` |
| `apps/services/src/modules/users/dtos/updateProfileDto.ts` | CREATE | Rename of `updateProfile.dto.ts`; content identical |
| `apps/services/src/app.ts` | MODIFY | Update imports: `error-handler.js` → `errorHandler.js`, `clerk-auth.plugin.js` → `clerkAuthPlugin.js` |
| `apps/services/src/shared/plugins/requireOrg.ts` | MODIFY | Update import: `require-auth.js` → `requireAuth.js` |
| `apps/services/src/modules/billing/routes.ts` | MODIFY | Update import: `require-auth.js` → `requireAuth.js` |
| `apps/services/src/modules/billing/handlers/checkoutHandler.ts` | MODIFY | Update import: `checkout.dto.js` → `checkoutDto.js` |
| `apps/services/src/modules/billing/handlers/listTransactionsHandler.ts` | MODIFY | Update import: `checkout.dto.js` → `checkoutDto.js` |
| `apps/services/src/modules/billing/repositories/interfaces/iTransactionRepository.ts` | MODIFY | Update imports: `transaction.entity.js` → `transactionEntity.js`, `refund.entity.js` → `refundEntity.js` |
| `apps/services/src/modules/billing/repositories/transactionDBRepository.ts` | MODIFY | Update imports: `transaction.entity.js` → `transactionEntity.js`, `refund.entity.js` → `refundEntity.js` |
| `apps/services/src/modules/billing/useCases/checkoutUseCase.ts` | MODIFY | Update import: `checkout.dto.js` → `checkoutDto.js` |
| `apps/services/src/modules/billing/useCases/getRefundsUseCase.ts` | MODIFY | Update import: `refund.entity.js` → `refundEntity.js` |
| `apps/services/src/modules/billing/useCases/getTransactionUseCase.ts` | MODIFY | Update import: `transaction.entity.js` → `transactionEntity.js` |
| `apps/services/src/modules/subscriptions/repositories/interfaces/iSubscriptionPlanRepository.ts` | MODIFY | Update import: `subscriptionPlan.entity.js` → `subscriptionPlanEntity.js` |
| `apps/services/src/modules/subscriptions/repositories/subscriptionPlanDBRepository.ts` | MODIFY | Update import: `subscriptionPlan.entity.js` → `subscriptionPlanEntity.js` |
| `apps/services/src/modules/subscriptions/useCases/listPlansUseCase.ts` | MODIFY | Update import: `subscriptionPlan.entity.js` → `subscriptionPlanEntity.js` |
| `apps/services/src/modules/users/routes.ts` | MODIFY | Update import: `require-auth.js` → `requireAuth.js` |
| `apps/services/src/modules/users/handlers/completeOnboardingHandler.ts` | MODIFY | Update import: `completeOnboarding.dto.js` → `completeOnboardingDto.js` |
| `apps/services/src/modules/users/handlers/updateUserProfileHandler.ts` | MODIFY | Update import: `updateProfile.dto.js` → `updateProfileDto.js` |
| `apps/services/tests/unit/billing/checkoutUseCase.test.ts` | MODIFY | Update imports: `transaction.entity.js` → `transactionEntity.js`, `checkout.dto.js` → `checkoutDto.js` |
| `apps/services/tests/unit/billing/getRefundsUseCase.test.ts` | MODIFY | Update imports: `transaction.entity.js` → `transactionEntity.js`, `refund.entity.js` → `refundEntity.js` |
| `apps/services/tests/unit/billing/getTransactionUseCase.test.ts` | MODIFY | Update import: `transaction.entity.js` → `transactionEntity.js` |
| `apps/services/tests/unit/billing/listTransactionsUseCase.test.ts` | MODIFY | Update import: `transaction.entity.js` → `transactionEntity.js` |
| `apps/services/tests/unit/billing/transactionDBRepository.test.ts` | MODIFY | Update imports: `transaction.entity.js` → `transactionEntity.js`, `refund.entity.js` → `refundEntity.js` |
| `apps/services/tests/unit/modules/subscriptions/listPlansHandler.test.ts` | MODIFY | Update import: `subscriptionPlan.entity.js` → `subscriptionPlanEntity.js` |
| `apps/services/tests/unit/modules/subscriptions/listPlansUseCase.test.ts` | MODIFY | Update import: `subscriptionPlan.entity.js` → `subscriptionPlanEntity.js` |
| `apps/services/tests/unit/modules/subscriptions/subscriptionPlanDBRepository.test.ts` | MODIFY | Update import: `subscriptionPlan.entity.js` → `subscriptionPlanEntity.js` |

## Requirement coverage

| ID | Design decision |
|---|---|
| R001 | Plugin files renamed: `error-handler.ts` → `errorHandler.ts`, `clerk-auth.plugin.ts` → `clerkAuthPlugin.ts`, `require-auth.ts` → `requireAuth.ts`, `require-org.ts` → `requireOrg.ts` — no hyphens, no `.plugin.ts` suffix |
| R002 | Entity files renamed: `transaction.entity.ts` → `transactionEntity.ts`, `refund.entity.ts` → `refundEntity.ts`, `subscriptionPlan.entity.ts` → `subscriptionPlanEntity.ts`, `user.entity.ts` → `userEntity.ts` — no `.entity.ts` suffix |
| R003 | DTO files renamed: `checkout.dto.ts` → `checkoutDto.ts`, `completeOnboarding.dto.ts` → `completeOnboardingDto.ts`, `updateProfile.dto.ts` → `updateProfileDto.ts` — no `.dto.ts` suffix |
| R004 | All 22 source and test files that contain imports referencing the old names are listed in the Files section as MODIFY with their import paths updated |
| R005 | No class, function, interface, type, or module export name is altered — only file names and the string literals in import specifiers |
| R006 | Test files appear as MODIFY entries updating only import path strings; all test logic (assertions, mocks, fixtures) remains unchanged |
| NF001 | After all renames, every file under `apps/services/src/` carries only `.ts` or `.test.ts` suffixes and no hyphens in any filename |
| NF002 | Each file is git-renamed (DELETE old + CREATE new with identical content) in a single commit, ensuring git's similarity detection tracks the rename at or above the 50% threshold |
