import { logger } from '../../../shared/infrastructure/logger.js';
import type {
  ApplyDeliveryEventOutcome,
  IEmailDeliveriesRepository,
  TerminalEmailDeliveryState,
} from '../../../shared/repositories/interfaces/iEmailDeliveriesRepository.js';
import type { IEmailSuppressionsRepository, SuppressionReason } from '../../../shared/repositories/interfaces/iEmailSuppressionsRepository.js';
import type { SesEventDto } from './dtos/sesEventSchema.js';

interface SuppressionTarget {
  email: string;
  reason: SuppressionReason;
}

// R003: maps the SES eventType to the corresponding terminal delivery state. Event types outside
// this map (Send, Open, Click, DeliveryDelay, Rendering Failure, etc.) are not target states.
const EVENT_TYPE_TO_STATE: Record<string, TerminalEmailDeliveryState> = {
  Delivery: 'delivered',
  Bounce: 'bounced',
  Complaint: 'complained',
  Reject: 'failed',
};

// NF001, EC002, EC004: not_found/already_terminal are logged and discarded, never thrown.
function logOutcome(
  outcome: ApplyDeliveryEventOutcome,
  providerMessageId: string,
  state: TerminalEmailDeliveryState,
): void {
  const context = { providerMessageId, state, outcome };
  if (outcome === 'applied') {
    logger.info(context, 'sesEventHandlers: applied delivery event');
  } else {
    logger.warn(context, 'sesEventHandlers: discarded delivery event');
  }
}

// R002, EC001, EC003: independent of the delivery-state mapping above — a permanent bounce or a
// complaint always suppresses its recipients, even when the delivery record is already terminal.
function extractSuppressionTargets(event: SesEventDto): SuppressionTarget[] {
  if (event.eventType === 'Bounce' && event.bounce?.bounceType === 'Permanent') {
    return (event.bounce.bouncedRecipients ?? []).map((recipient) => ({
      email: recipient.emailAddress,
      reason: 'bounce' as const,
    }));
  }

  if (event.eventType === 'Complaint') {
    return (event.complaint?.complainedRecipients ?? []).map((recipient) => ({
      email: recipient.emailAddress,
      reason: 'complaint' as const,
    }));
  }

  return [];
}

async function suppressEventTargets(event: SesEventDto, suppressions: IEmailSuppressionsRepository): Promise<void> {
  for (const target of extractSuppressionTargets(event)) {
    await suppressions.upsert(target.email, target.reason);
  }
}

export async function dispatchSesEvent(
  event: SesEventDto,
  repository: IEmailDeliveriesRepository,
  suppressions: IEmailSuppressionsRepository,
): Promise<void> {
  const state = EVENT_TYPE_TO_STATE[event.eventType];

  if (state) {
    const outcome = await repository.applyDeliveryEventByProviderMessageId(event.mail.messageId, state);
    logOutcome(outcome, event.mail.messageId, state);
  } else {
    logger.info({ eventType: event.eventType }, 'sesEventHandlers: ignoring non-target event type');
  }

  await suppressEventTargets(event, suppressions);
}
