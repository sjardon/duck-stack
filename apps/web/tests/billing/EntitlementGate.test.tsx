import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

vi.mock('../../src/hooks/use-entitlement', () => ({
  useEntitlement: vi.fn(),
}));

import { useEntitlement } from '../../src/hooks/use-entitlement';
import { EntitlementGate } from '../../src/components/domain/billing/EntitlementGate';

const mockUseEntitlement = useEntitlement as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

// T023 — R008: renders children when entitlement is present
describe('EntitlementGate — renders children when entitlement present (R008)', () => {
  it('WHEN useEntitlement returns true THEN renders children', () => {
    mockUseEntitlement.mockReturnValue(true);

    render(
      React.createElement(
        EntitlementGate,
        { name: 'advanced_analytics' },
        React.createElement('div', null, 'protected content'),
      ),
    );

    expect(screen.getByText('protected content')).toBeDefined();
  });
});

// T023 — R009: renders upgrade CTA fallback when entitlement absent
describe('EntitlementGate — renders fallback when entitlement absent (R009)', () => {
  it('WHEN useEntitlement returns false THEN renders default upgrade CTA fallback', () => {
    mockUseEntitlement.mockReturnValue(false);

    render(
      React.createElement(
        EntitlementGate,
        { name: 'team_collaboration' },
        React.createElement('div', null, 'protected content'),
      ),
    );

    expect(screen.queryByText('protected content')).toBeNull();
    expect(screen.getAllByText(/upgrade/i).length).toBeGreaterThan(0);
  });

  it('WHEN useEntitlement returns false and fallback prop is provided THEN renders custom fallback', () => {
    mockUseEntitlement.mockReturnValue(false);

    render(
      React.createElement(
        EntitlementGate,
        {
          name: 'white_label',
          fallback: React.createElement('span', null, 'custom fallback'),
        },
        React.createElement('div', null, 'protected content'),
      ),
    );

    expect(screen.queryByText('protected content')).toBeNull();
    expect(screen.getByText('custom fallback')).toBeDefined();
    expect(screen.queryByText(/upgrade/i)).toBeNull();
  });
});
