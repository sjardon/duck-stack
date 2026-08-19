import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('@posthog/react', () => ({
  useFeatureFlagEnabled: vi.fn(),
}));

vi.mock('../../src/lib/analytics', () => ({
  readAnalyticsConfig: vi.fn(),
}));

import { useFeatureFlagEnabled } from '@posthog/react';
import { readAnalyticsConfig } from '../../src/lib/analytics';
import { useFeatureFlag } from '../../src/hooks/useFeatureFlag';

const mockUseFeatureFlagEnabled = useFeatureFlagEnabled as ReturnType<typeof vi.fn>;
const mockReadAnalyticsConfig = readAnalyticsConfig as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockReadAnalyticsConfig.mockReturnValue({ key: 'phc_test_123', host: 'https://us.i.posthog.com' });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// T016 — R005

describe('useFeatureFlag — resolves to enabled/disabled once loaded (R005)', () => {
  it('WHEN the mocked useFeatureFlagEnabled returns true and analytics is configured THEN it returns { enabled: true, isResolved: true }', () => {
    mockUseFeatureFlagEnabled.mockReturnValue(true);

    const { result } = renderHook(() => useFeatureFlag('new-dashboard'));

    expect(result.current).toEqual({ enabled: true, isResolved: true });
  });

  it('WHEN the mocked useFeatureFlagEnabled returns false and analytics is configured THEN it returns { enabled: false, isResolved: true }', () => {
    mockUseFeatureFlagEnabled.mockReturnValue(false);

    const { result } = renderHook(() => useFeatureFlag('new-dashboard'));

    expect(result.current).toEqual({ enabled: false, isResolved: true });
  });
});

// T018 — R008, NF004

describe('useFeatureFlag — not-configured returns deterministic safe default (R008, NF004)', () => {
  it('WHEN readAnalyticsConfig returns null THEN it returns { enabled: false, isResolved: true } regardless of the mocked value, and useFeatureFlagEnabled is still called unconditionally', () => {
    mockReadAnalyticsConfig.mockReturnValue(null);
    mockUseFeatureFlagEnabled.mockReturnValue(true);

    const { result } = renderHook(() => useFeatureFlag('new-dashboard'));

    expect(result.current).toEqual({ enabled: false, isResolved: true });
    expect(mockUseFeatureFlagEnabled).toHaveBeenCalledWith('new-dashboard');
  });
});

// T020 — EC001, EC002, NF004

describe('useFeatureFlag — unresolved returns a safe default and never throws (EC001, EC002, NF004)', () => {
  it('WHEN analytics is configured and useFeatureFlagEnabled returns undefined THEN it returns { enabled: false, isResolved: false } without throwing', () => {
    mockUseFeatureFlagEnabled.mockReturnValue(undefined);

    let result: ReturnType<typeof useFeatureFlag> | undefined;
    expect(() => {
      result = renderHook(() => useFeatureFlag('new-dashboard')).result.current;
    }).not.toThrow();

    expect(result).toEqual({ enabled: false, isResolved: false });
  });
});

// T022 — EC006

describe('useFeatureFlag — re-resolves after identification (EC006)', () => {
  it('WHEN the mocked useFeatureFlagEnabled value changes across a re-render THEN the hook reflects the new value rather than the previously resolved one', () => {
    mockUseFeatureFlagEnabled.mockReturnValue(undefined);

    const { result, rerender } = renderHook(() => useFeatureFlag('new-dashboard'));

    expect(result.current).toEqual({ enabled: false, isResolved: false });

    mockUseFeatureFlagEnabled.mockReturnValue(true);
    rerender();

    expect(result.current).toEqual({ enabled: true, isResolved: true });
  });
});
