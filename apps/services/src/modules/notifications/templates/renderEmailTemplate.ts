import { createElement } from 'react';
import { render } from '@react-email/render';
import type { EmailTemplateId, EmailTemplateContextMap } from '@repo/types';
import { emailTemplateRegistry } from './emailTemplateRegistry.js';

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export async function renderEmailTemplate<T extends EmailTemplateId>(
  templateId: T,
  context: EmailTemplateContextMap[T],
): Promise<RenderedEmail | undefined> {
  const entry = emailTemplateRegistry[templateId];

  // Unregistered template id — signals R004/EC001 to the caller without throwing.
  if (!entry) {
    return undefined;
  }

  const element = createElement(entry.Component, context);
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);

  return { subject: entry.subject, html, text };
}
