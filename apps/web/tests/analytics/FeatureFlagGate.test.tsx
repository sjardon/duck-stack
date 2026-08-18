import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../../src/hooks/useFeatureFlag', () => ({
  useFeatureFlag: vi.fn(),
}));

import { useFeatureFlag } from '../../src/hooks/useFeatureFlag';
import { FeatureFlagGate } from '../../src/components/flags/FeatureFlagGate';

const mockUseFeatureFlag = useFeatureFlag as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

// T023 — EC001

describe('FeatureFlagGate — never renders enabled before resolved (EC001)', () => {
  it('WHEN isResolved is false THEN it renders the loading prop, never children', () => {
    mockUseFeatureFlag.mockReturnValue({ enabled: false, isResolved: false });

    render(
      <FeatureFlagGate flag="new-dashboard" loading={<span>loading</span>} fallback={<span>fallback</span>}>
        <span>enabled content</span>
      </FeatureFlagGate>
    );

    expect(screen.getByText('loading')).toBeInTheDocument();
    expect(screen.queryByText('enabled content')).not.toBeInTheDocument();
    expect(screen.queryByText('fallback')).not.toBeInTheDocument();
  });

  it('WHEN isResolved is false and loading is omitted THEN it renders the fallback prop, never children', () => {
    mockUseFeatureFlag.mockReturnValue({ enabled: false, isResolved: false });

    render(
      <FeatureFlagGate flag="new-dashboard" fallback={<span>fallback</span>}>
        <span>enabled content</span>
      </FeatureFlagGate>
    );

    expect(screen.getByText('fallback')).toBeInTheDocument();
    expect(screen.queryByText('enabled content')).not.toBeInTheDocument();
  });

  it('WHEN isResolved is true and enabled is true THEN it renders children', () => {
    mockUseFeatureFlag.mockReturnValue({ enabled: true, isResolved: true });

    render(
      <FeatureFlagGate flag="new-dashboard" loading={<span>loading</span>} fallback={<span>fallback</span>}>
        <span>enabled content</span>
      </FeatureFlagGate>
    );

    expect(screen.getByText('enabled content')).toBeInTheDocument();
    expect(screen.queryByText('loading')).not.toBeInTheDocument();
    expect(screen.queryByText('fallback')).not.toBeInTheDocument();
  });

  it('WHEN isResolved is true and enabled is false THEN it renders fallback', () => {
    mockUseFeatureFlag.mockReturnValue({ enabled: false, isResolved: true });

    render(
      <FeatureFlagGate flag="new-dashboard" loading={<span>loading</span>} fallback={<span>fallback</span>}>
        <span>enabled content</span>
      </FeatureFlagGate>
    );

    expect(screen.getByText('fallback')).toBeInTheDocument();
    expect(screen.queryByText('enabled content')).not.toBeInTheDocument();
    expect(screen.queryByText('loading')).not.toBeInTheDocument();
  });
});
