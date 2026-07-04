// Mock @react-email/render to avoid dynamic import issues in Jest/CommonJS
jest.mock('@react-email/render', () => ({
  render: jest.fn().mockImplementation((element: unknown) => {
    // Simulate a minimal HTML render including the recipientName prop
    const props = (element as { props?: { recipientName?: string } })?.props ?? {};
    const name = props.recipientName ?? '';
    return Promise.resolve(`<!DOCTYPE html><html><head></head><body><p>Welcome, ${name}!</p></body></html>`);
  }),
}));

import { templateRegistry } from '../../../../../src/modules/notifications/templates/templateRegistry.js';

describe('templateRegistry — example.welcome_demo (R001, R009)', () => {
  it('WHEN templateRegistry[example.welcome_demo].render is called with valid vars THEN it returns a non-empty HTML string', async () => {
    const entry = templateRegistry['example.welcome_demo'];

    expect(entry).toBeDefined();
    expect(typeof entry.render).toBe('function');
    expect(typeof entry.subject).toBe('string');
    expect(entry.subject.length).toBeGreaterThan(0);

    const html = await entry.render({ recipientName: 'Alice' });

    expect(typeof html).toBe('string');
    expect(html.length).toBeGreaterThan(0);
    expect(html).toContain('Alice');
    expect(html.toLowerCase()).toMatch(/<html|<!doctype/i);
  });
});
