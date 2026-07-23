import { logger } from '../../../shared/infrastructure/logger.js';
import type {
  ApplyDeliveryEventOutcome,
  IEmailDeliveriesRepository,
  TerminalEmailDeliveryState,
} from '../../../shared/repositories/interfaces/iEmailDeliveriesRepository.js';
import type { SesEventDto } from './dtos/sesEventSchema.js';

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

export async function dispatchSesEvent(
  event: SesEventDto,
  repository: IEmailDeliveriesRepository,
): Promise<void> {
  const state = EVENT_TYPE_TO_STATE[event.eventType];

  if (!state) {
    logger.info({ eventType: event.eventType }, 'sesEventHandlers: ignoring non-target event type');
    return;
  }

  const outcome = await repository.applyDeliveryEventByProviderMessageId(event.mail.messageId, state);
  logOutcome(outcome, event.mail.messageId, state);
}
