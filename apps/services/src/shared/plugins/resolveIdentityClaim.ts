import { logger } from '../infrastructure/logger.js';

const INITIAL_BACKOFF_MS = 100;
const DEFAULT_BUDGET_MS = 2000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// NF002, NF003: retries `lookup` with exponential backoff (starting at 100ms,
// doubling, capped to the remaining budget) until it resolves a non-null value
// or the budget is exhausted, in which case it returns null (R006, R007).
export async function withRetryBackoff(
  lookup: () => Promise<string | null>,
  budgetMs: number = DEFAULT_BUDGET_MS,
): Promise<string | null> {
  const deadline = Date.now() + budgetMs;
  let delay = INITIAL_BACKOFF_MS;

  let result = await lookup();
  while (result === null) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      return null;
    }

    await sleep(Math.min(delay, remaining));
    delay *= 2;

    if (Date.now() >= deadline) {
      return null;
    }

    result = await lookup();
  }

  return result;
}

export interface ResolveIdentityClaimParams {
  claimValue: string | undefined;
  clerkId: string;
  lookupById: (clerkId: string) => Promise<string | null>;
  backfill: (clerkId: string, internalId: string) => Promise<void>;
  budgetMs?: number;
}

// R001, R002, R006, R007, R008, NF001–NF004, EC002, EC003, EC006:
// claim-first fast path (no DB hit), retry-with-backoff degraded path,
// and fire-and-forget lazy backfill of the resolved id to Clerk metadata.
export async function resolveIdentityClaim(
  params: ResolveIdentityClaimParams,
): Promise<string | null> {
  if (params.claimValue) {
    return params.claimValue; // NF001 — no DB hit, EC003 — trusted as-is
  }

  const internalId = await withRetryBackoff(
    () => params.lookupById(params.clerkId),
    params.budgetMs ?? DEFAULT_BUDGET_MS,
  );

  if (internalId === null) {
    return null; // caller throws ServiceUnavailableError (R007)
  }

  // R008, EC002, NF004: fire-and-forget backfill; a failed write here is non-critical
  // because the webhook-side blocking write (R009) is the primary path and the next
  // unresolved request will retry this same backfill — silent-fail justified by NF004.
  void params.backfill(params.clerkId, internalId).catch((err: unknown) => {
    logger.warn(
      { err, clerkId: params.clerkId },
      'resolveIdentityClaim: lazy backfill to Clerk metadata failed',
    );
  });

  return internalId;
}
