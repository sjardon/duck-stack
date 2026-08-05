import { renderEmailTemplate } from '../../../../../src/modules/notifications/templates/renderEmailTemplate.js';

// T009 — R002
describe('renderEmailTemplate — produces HTML and plain text (R002)', () => {
  it("WHEN renderEmailTemplate('welcome', { recipientName }) is called THEN it resolves with { subject, html, text } where html contains recipientName inside markup and text contains recipientName without HTML tags", async () => {
    const result = await renderEmailTemplate('welcome', { recipientName: 'Ada Lovelace' });

    expect(result).toBeDefined();
    expect(typeof result?.subject).toBe('string');
    expect(result?.subject.length).toBeGreaterThan(0);

    expect(result?.html).toContain('Ada Lovelace');
    expect(result?.html).toMatch(/<[a-z][\s\S]*>/i);

    expect(result?.text).toContain('Ada Lovelace');
    expect(result?.text).not.toMatch(/<[a-z][^>]*>/i);
  });
});
