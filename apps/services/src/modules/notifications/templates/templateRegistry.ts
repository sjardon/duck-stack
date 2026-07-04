import * as React from 'react';
import { render } from '@react-email/render';
import type { EmailTemplateId, EmailTemplateMap } from '@repo/types';
import { ExampleWelcomeDemoEmail } from './exampleWelcomeDemoEmail.js';

export interface TemplateEntry<T extends EmailTemplateId> {
  subject: string;
  render: (vars: EmailTemplateMap[T]) => Promise<string>;
}

export type TemplateRegistry = {
  [K in EmailTemplateId]: TemplateEntry<K>;
};

export const templateRegistry: TemplateRegistry = {
  'example.welcome_demo': {
    subject: 'Welcome to duck-stack',
    render: (vars) =>
      render(React.createElement(ExampleWelcomeDemoEmail, vars)),
  },
};
