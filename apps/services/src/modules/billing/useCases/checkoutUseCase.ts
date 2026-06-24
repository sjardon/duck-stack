import crypto from 'node:crypto';
import { resolveProvider } from '../providers/resolveProvider.js';
import { ProviderError } from '../../../shared/errors.js';
import type { ITransactionRepository } from '../repositories/interfaces/iTransactionRepository.js';
import type { CheckoutBodyType } from '../dtos/checkoutDto.js';

export class CheckoutUseCase {
  constructor(private readonly repo: ITransactionRepository) {}

  async execute(
    userId: string,
    orgId: string | null,
    body: CheckoutBodyType,
    idempotencyKey?: string,
  ): Promise<{ checkoutUrl: string; transactionId: string }> {
    // R012: return cached result for duplicate idempotency key
    if (idempotencyKey) {
      const existing = await this.repo.findByIdempotencyKey(idempotencyKey, userId, orgId);
      if (existing) {
        return {
          checkoutUrl: existing.checkout_url ?? '',
          transactionId: existing.id,
        };
      }
    }

    // R011, NF004: generate id first and use it as the reference; insert before calling provider
    const id = crypto.randomUUID();

    const transaction = await this.repo.create({
      id,
      user_id: userId,
      org_id: orgId,
      provider: 'mobbex',
      amount: body.amount,
      currency: body.currency,
      description: body.description,
      reference: id,
      idempotency_key: idempotencyKey,
      metadata: body.metadata ?? null,
    });

    // R003: call provider after local record is persisted
    const provider = resolveProvider();

    try {
      const session = await provider.createCheckout({
        reference: transaction.id,
        total: { amount: body.amount, currency: body.currency },
        description: body.description,
        callbackUrl: '',
        webhookUrl: '',
        ...(body.items ? { items: body.items } : {}),
      });

      // R004: persist provider data and return checkout URL
      await this.repo.updateProviderData(transaction.id, {
        providerTransactionId: session.sessionId,
        checkoutUrl: session.checkoutUrl,
      });

      return { checkoutUrl: session.checkoutUrl, transactionId: transaction.id };
    } catch (err) {
      // R005, EC004: persist failure_reason and re-throw
      if (err instanceof ProviderError) {
        await this.repo.updateFailureReason(transaction.id, err.message);
      }
      throw err;
    }
  }
}
