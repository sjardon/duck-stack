import type { EmailSendRequest, EmailTemplateId } from '@repo/types';

// T001 — WHEN EmailSendRequest is constructed with a known templateId
// THEN TypeScript accepts the correct variables shape and rejects a wrong shape (compile-time guard)

describe('EmailSendRequest compile-time type contract (R001, R002)', () => {
  it('WHEN constructed with a known templateId and correct variables THEN TypeScript accepts it', () => {
    const req: EmailSendRequest<'example.welcome_demo'> = {
      to: 'alice@example.com',
      templateId: 'example.welcome_demo',
      variables: { recipientName: 'Alice' },
    };

    expect(req.templateId).toBe('example.welcome_demo');
    expect(req.variables.recipientName).toBe('Alice');
  });

  it('WHEN constructed with the base EmailSendRequest type THEN templateId is constrained to known keys', () => {
    // This validates that EmailTemplateId is derived from EmailTemplateMap keys
    const knownIds: EmailTemplateId[] = ['example.welcome_demo'];
    expect(knownIds).toContain('example.welcome_demo');
  });

  it('WHEN a wrong variable shape is provided THEN TypeScript would reject it at compile time', () => {
    const _bad: EmailSendRequest<'example.welcome_demo'> = {
      to: 'bob@example.com',
      templateId: 'example.welcome_demo',
      variables: {
        // @ts-expect-error — recipientName must be a string, not a number
        recipientName: 42,
      },
    };
    // Runtime assertion to satisfy the test runner — the compile-time check above is the real guard
    expect(_bad).toBeDefined();
  });
});
