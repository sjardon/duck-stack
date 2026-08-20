import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ReactElement } from 'react';

const mockRender = vi.fn();
const mockCreateRoot = vi.fn(() => ({ render: mockRender }));

vi.mock('react-dom/client', () => ({
  createRoot: mockCreateRoot,
}));

vi.mock('../../src/lib/errorTracking', () => ({
  initErrorTracking: vi.fn(),
}));

vi.mock('../../src/lib/analytics', () => ({
  initAnalytics: vi.fn(),
}));

vi.mock('../../src/components/error/AppErrorBoundary', () => ({
  AppErrorBoundary: (props: { children: ReactElement }) => props.children,
}));

vi.mock('../../src/App', () => ({
  default: () => null,
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  document.body.innerHTML = '<div id="root"></div>';
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// T022 — R009, R010

describe('main.tsx — bootstrap initializes analytics before render (R009, R010)', () => {
  it('WHEN main.tsx is imported THEN initAnalytics runs before createRoot(...).render(...), alongside the existing initErrorTracking() call', async () => {
    await import('../../src/main');

    const { initErrorTracking } = await import('../../src/lib/errorTracking');
    const { initAnalytics } = await import('../../src/lib/analytics');

    const mockInitErrorTracking = initErrorTracking as ReturnType<typeof vi.fn>;
    const mockInitAnalytics = initAnalytics as ReturnType<typeof vi.fn>;

    expect(mockInitErrorTracking).toHaveBeenCalledTimes(1);
    expect(mockInitAnalytics).toHaveBeenCalledTimes(1);
    expect(mockRender).toHaveBeenCalledTimes(1);
    expect(mockInitAnalytics.mock.invocationCallOrder[0]).toBeLessThan(
      mockRender.mock.invocationCallOrder[0],
    );
  });
});
