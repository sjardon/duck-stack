import { createElement } from 'react';
import { render } from '@react-email/render';
import { ExamplePingEmail } from './examplePingEmail.js';

export const EMAIL_TEMPLATE_IDS = ['example.ping'] as const;
export type EmailTemplateId = (typeof EMAIL_TEMPLATE_IDS)[number];

export interface EmailTemplateVariables {
  'example.ping': { recipientName: string; sentAt: string };
}

export interface EmailTemplateDefinition<K extends EmailTemplateId> {
  subject: (variables: EmailTemplateVariables[K]) => string;
  render: (variables: EmailTemplateVariables[K]) => Promise<string>;
}

// createElement (not JSX) — this file is .ts, and JSX syntax requires .tsx.
export const emailTemplateRegistry: { [K in EmailTemplateId]: EmailTemplateDefinition<K> } = {
  'example.ping': {
    subject: (variables) => `Ping for ${variables.recipientName}`,
    render: (variables) => render(createElement(ExamplePingEmail, variables)),
  },
};

export function isKnownEmailTemplate(id: string): id is EmailTemplateId {
  return (EMAIL_TEMPLATE_IDS as readonly string[]).includes(id);
}
