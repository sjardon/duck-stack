import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('posthog-js', () => ({
  default: {
    init: vi.fn(),
    capture: vi.fn(),
    get_distinct_id: vi.fn(() => null),
  },
}));

import posthog from 'posthog-js';
import CTA from '../../src/components/sections/CTA';

const mockCapture = posthog.capture as ReturnType<typeof vi.fn>;
const mockGetDistinctId = posthog.get_distinct_id as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockGetDistinctId.mockReturnValue(null);
  localStorage.clear();
  vi.stubEnv('VITE_WEB_URL', 'http://web.test');
  Object.defineProperty(window, 'location', {
    value: { href: '' },
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// T013 — R007

describe('CTA — "Get early access" navigates to the registration entry point (R007)', () => {
  it('WHEN clicked THEN window.location.href is set to VITE_WEB_URL/sign-up with no landing_id when analytics is unconfigured', () => {
    render(<CTA />);

    fireEvent.click(screen.getByRole('button', { name: /get early access/i }));

    expect(window.location.href).toBe('http://web.test/sign-up');
  });
});

// T017 — R003, NF001, NF002

describe('CTA — conversion event recorded synchronously before navigation, no PII (R003, NF001, NF002)', () => {
  it("WHEN clicked THEN captureEvent('registration_started', ...) is called before window.location.href is set, with no PII in the payload", () => {
    mockCapture.mockImplementation(() => {
      expect(window.location.href).toBe('');
    });

    render(<CTA />);
    fireEvent.click(screen.getByRole('button', { name: /get early access/i }));

    expect(mockCapture).toHaveBeenCalledTimes(1);
    const [name, properties] = mockCapture.mock.calls[0];
    expect(name).toBe('registration_started');
    expect(properties).toEqual({ action: 'cta' });
    expect(window.location.href).toBe('http://web.test/sign-up');
  });
});
