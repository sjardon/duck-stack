import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

vi.mock('../../src/hooks/useTrialStatus', () => ({
  useTrialStatus: vi.fn(),
}));

import { useTrialStatus } from '../../src/hooks/useTrialStatus';
import TrialBanner from '../../src/components/domain/billing/TrialBanner';

const mockUseTrialStatus = useTrialStatus as ReturnType<typeof vi.fn>;

function renderBanner() {
  return render(
    <MemoryRouter>
      <TrialBanner />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

// T013 — R007: renders nothing outside urgency window

describe('TrialBanner — renders nothing (R007)', () => {
  it('WHEN isTrialing === false THEN renders nothing', () => {
    mockUseTrialStatus.mockReturnValue({
      isTrialing: false,
      isExpired: false,
      daysRemaining: null,
      trialEndsAt: null,
      isLoading: false,
    });

    const { container } = renderBanner();

    expect(container.firstChild).toBeNull();
  });

  it('WHEN isTrialing === true but daysRemaining > 3 THEN renders nothing', () => {
    mockUseTrialStatus.mockReturnValue({
      isTrialing: true,
      isExpired: false,
      daysRemaining: 5,
      trialEndsAt: '2026-07-08T00:00:00Z',
      isLoading: false,
    });

    const { container } = renderBanner();

    expect(container.firstChild).toBeNull();
  });

  it('WHEN daysRemaining === null THEN renders nothing', () => {
    mockUseTrialStatus.mockReturnValue({
      isTrialing: true,
      isExpired: false,
      daysRemaining: null,
      trialEndsAt: null,
      isLoading: false,
    });

    const { container } = renderBanner();

    expect(container.firstChild).toBeNull();
  });

  it('WHEN isLoading === true THEN renders nothing', () => {
    mockUseTrialStatus.mockReturnValue({
      isTrialing: false,
      isExpired: false,
      daysRemaining: null,
      trialEndsAt: null,
      isLoading: true,
    });

    const { container } = renderBanner();

    expect(container.firstChild).toBeNull();
  });
});

// T014 — R006, R008, NF003, EC007

describe('TrialBanner — renders urgency text (R006)', () => {
  it('WHEN isTrialing === true and daysRemaining === 2 THEN renders "2 days left in your trial — upgrade now"', () => {
    mockUseTrialStatus.mockReturnValue({
      isTrialing: true,
      isExpired: false,
      daysRemaining: 2,
      trialEndsAt: '2026-07-05T00:00:00Z',
      isLoading: false,
    });

    renderBanner();

    expect(screen.getByText(/2 days left in your trial — upgrade now/i)).toBeInTheDocument();
  });

  it('WHEN isTrialing === true and daysRemaining === 2 THEN renders a link to /pricing', () => {
    mockUseTrialStatus.mockReturnValue({
      isTrialing: true,
      isExpired: false,
      daysRemaining: 2,
      trialEndsAt: '2026-07-05T00:00:00Z',
      isLoading: false,
    });

    renderBanner();

    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/pricing');
  });

  it('WHEN isTrialing === true and daysRemaining === 1 THEN renders "1 days left in your trial — upgrade now"', () => {
    mockUseTrialStatus.mockReturnValue({
      isTrialing: true,
      isExpired: false,
      daysRemaining: 1,
      trialEndsAt: '2026-07-04T00:00:00Z',
      isLoading: false,
    });

    renderBanner();

    expect(screen.getByText(/1 days left in your trial — upgrade now/i)).toBeInTheDocument();
  });

  it('WHEN isTrialing === true and daysRemaining === 3 THEN renders "3 days left in your trial — upgrade now"', () => {
    mockUseTrialStatus.mockReturnValue({
      isTrialing: true,
      isExpired: false,
      daysRemaining: 3,
      trialEndsAt: '2026-07-06T00:00:00Z',
      isLoading: false,
    });

    renderBanner();

    expect(screen.getByText(/3 days left in your trial — upgrade now/i)).toBeInTheDocument();
  });
});

describe('TrialBanner — daysRemaining === 0 (R008, EC007)', () => {
  it('WHEN daysRemaining === 0 THEN renders "Less than 1 day left in your trial — upgrade now"', () => {
    mockUseTrialStatus.mockReturnValue({
      isTrialing: true,
      isExpired: false,
      daysRemaining: 0,
      trialEndsAt: '2026-07-03T23:59:59Z',
      isLoading: false,
    });

    renderBanner();

    expect(
      screen.getByText(/Less than 1 day left in your trial — upgrade now/i),
    ).toBeInTheDocument();
  });
});

describe('TrialBanner — fixed positioning (NF003)', () => {
  it('WHEN banner renders THEN its root element has position: fixed style', () => {
    mockUseTrialStatus.mockReturnValue({
      isTrialing: true,
      isExpired: false,
      daysRemaining: 2,
      trialEndsAt: '2026-07-05T00:00:00Z',
      isLoading: false,
    });

    const { container } = renderBanner();

    const bannerEl = container.firstChild as HTMLElement;
    expect(bannerEl).not.toBeNull();
    expect(bannerEl.style.position).toBe('fixed');
  });
});
