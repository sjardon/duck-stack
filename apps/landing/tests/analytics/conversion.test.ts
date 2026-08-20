import { describe, it, expect, vi, beforeEach } from 'vitest';
import { hasConverted, markConverted } from '../../src/lib/conversion';

function createMockLocalStorage(): Storage {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => (key in store ? store[key] : null),
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    key: () => null,
    length: 0,
  } as Storage;
}

beforeEach(() => {
  vi.stubGlobal('localStorage', createMockLocalStorage());
});

// T019 — R008, EC004

describe('hasConverted / markConverted — browser-local conversion idempotency guard (R008, EC004)', () => {
  it('WHEN no conversion has been recorded THEN hasConverted returns false', () => {
    expect(hasConverted()).toBe(false);
  });

  it('WHEN markConverted is called THEN hasConverted returns true on every subsequent call, persisting the flag across calls', () => {
    markConverted();

    expect(hasConverted()).toBe(true);
    expect(hasConverted()).toBe(true);
  });
});
