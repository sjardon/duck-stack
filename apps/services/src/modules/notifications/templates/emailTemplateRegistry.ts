import type { EmailTemplateId, EmailTemplateContextMap } from '@repo/types';
import { WelcomeEmail, welcomeEmailSubject } from './welcomeEmail.js';

export interface EmailTemplateEntry<T extends EmailTemplateId> {
  subject: string;
  Component: (props: EmailTemplateContextMap[T]) => JSX.Element;
}

export const emailTemplateRegistry: { [T in EmailTemplateId]: EmailTemplateEntry<T> } = {
  welcome: {
    subject: welcomeEmailSubject,
    Component: WelcomeEmail,
  },
};
