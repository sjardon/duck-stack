import type { EmailTemplateId, EmailTemplateVariables } from '../../templates/emailTemplateRegistry.js';

export interface IEmailNotifier {
  send<K extends EmailTemplateId>(
    templateId: K,
    variables: EmailTemplateVariables[K],
    recipient: { to: string; userId?: string },
  ): Promise<void>;
}
