import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';

vi.mock('../../src/lib/analytics', () => ({
  captureEvent: vi.fn(),
}));

vi.mock('../../src/lib/attribution', () => ({
  parseTrafficOrigin: vi.fn(() => ({
    utmSource: null,
    utmMedium: null,
    utmCampaign: null,
    utmTerm: null,
    utmContent: null,
    referrer: null,
  })),
  registerTrafficOrigin: vi.fn(),
}));

import { captureEvent } from '../../src/lib/analytics';
import { registerTrafficOrigin } from '../../src/lib/attribution';
import RouteVisitTracker from '../../src/components/analytics/RouteVisitTracker';

const mockCaptureEvent = captureEvent as ReturnType<typeof vi.fn>;
const mockRegisterTrafficOrigin = registerTrafficOrigin as ReturnType<typeof vi.fn>;

function Navigator({ to }: { to: string }): JSX.Element {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate(to)}>
      navigate
    </button>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

// T006 — R001

describe('RouteVisitTracker — records the visit event on mount and on navigation (R001)', () => {
  it('WHEN it mounts at a given path THEN captureEvent is called with landing_page_viewed and the route', () => {
    render(
      <MemoryRouter initialEntries={['/pricing']}>
        <RouteVisitTracker />
      </MemoryRouter>,
    );

    expect(mockCaptureEvent).toHaveBeenCalledWith('landing_page_viewed', { route: '/pricing' });
    expect(mockRegisterTrafficOrigin).toHaveBeenCalled();
  });

  it('WHEN the route changes THEN captureEvent is called again with the new route', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <RouteVisitTracker />
        <Navigator to="/pricing" />
      </MemoryRouter>,
    );

    expect(mockCaptureEvent).toHaveBeenCalledWith('landing_page_viewed', { route: '/' });

    fireEvent.click(screen.getByRole('button', { name: /navigate/i }));

    expect(mockCaptureEvent).toHaveBeenCalledWith('landing_page_viewed', { route: '/pricing' });
    expect(mockCaptureEvent).toHaveBeenCalledTimes(2);
  });
});
