import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

beforeEach(() => {
  vi.stubEnv('VITE_API_URL', 'http://api.test');

  Object.defineProperty(window, 'location', {
    value: { replace: vi.fn() },
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

import { apiFetch, ApiError } from '../src/api/client';

// T009 — R014, EC003

describe('apiFetch — TRIAL_EXPIRED interceptor (R014, EC003)', () => {
  it('WHEN fetch returns 403 with body { code: "TRIAL_EXPIRED" } THEN window.location.replace is called with /trial-expired and ApiError is thrown', async () => {
    const body = JSON.stringify({ code: 'TRIAL_EXPIRED', message: 'Trial expired' });

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      text: () => Promise.resolve(body),
      json: () => Promise.resolve({ code: 'TRIAL_EXPIRED', message: 'Trial expired' }),
      clone: () => ({
        json: () => Promise.resolve({ code: 'TRIAL_EXPIRED', message: 'Trial expired' }),
      }),
    });

    await expect(apiFetch('/some-protected-route')).rejects.toBeInstanceOf(ApiError);

    expect(window.location.replace).toHaveBeenCalledWith('/trial-expired');
  });

  it('WHEN fetch returns 403 with a different body THEN window.location.replace is NOT called and ApiError is thrown normally', async () => {
    const body = JSON.stringify({ code: 'FORBIDDEN', message: 'Forbidden' });

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      text: () => Promise.resolve(body),
      json: () => Promise.resolve({ code: 'FORBIDDEN', message: 'Forbidden' }),
    });

    await expect(apiFetch('/some-protected-route')).rejects.toBeInstanceOf(ApiError);

    expect(window.location.replace).not.toHaveBeenCalled();
  });

  it('WHEN fetch returns 403 with non-JSON body THEN window.location.replace is NOT called and ApiError is thrown', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      text: () => Promise.resolve('plain text error'),
    });

    await expect(apiFetch('/some-protected-route')).rejects.toBeInstanceOf(ApiError);

    expect(window.location.replace).not.toHaveBeenCalled();
  });

  it('WHEN fetch returns 500 THEN window.location.replace is NOT called', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: () => Promise.resolve('Server error'),
    });

    await expect(apiFetch('/some-protected-route')).rejects.toBeInstanceOf(ApiError);

    expect(window.location.replace).not.toHaveBeenCalled();
  });
});
