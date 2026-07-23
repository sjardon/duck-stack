import { emailTemplateRegistry } from '../../../../../src/modules/notifications/templates/emailTemplateRegistry.js';

describe('emailTemplateRegistry — example.ping (R009: non-business example template)', () => {
  it('WHEN render() and subject() are called THEN the HTML contains recipientName and subject is non-empty (R009)', async () => {
    const variables = { recipientName: 'Ada Lovelace', sentAt: '2026-07-22T00:00:00.000Z' };

    const html = await emailTemplateRegistry['example.ping'].render(variables);
    const subject = emailTemplateRegistry['example.ping'].subject(variables);

    expect(html).toContain('Ada Lovelace');
    expect(typeof subject).toBe('string');
    expect(subject.length).toBeGreaterThan(0);
  });
});
