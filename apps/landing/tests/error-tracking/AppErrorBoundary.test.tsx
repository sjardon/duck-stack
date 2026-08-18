import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

vi.mock('@sentry/react', () => {
  const mockCaptureException = vi.fn();

  class MockErrorBoundary extends React.Component<
    { children: React.ReactNode; fallback: React.ComponentType; showDialog?: boolean },
    { hasError: boolean }
  > {
    state = { hasError: false };
    static getDerivedStateFromError() {
      return { hasError: true };
    }
    componentDidCatch(error: unknown) {
      mockCaptureException(error);
    }
    render() {
      if (this.state.hasError) {
        const Fallback = this.props.fallback;
        return <Fallback />;
      }
      return this.props.children;
    }
  }

  return {
    ErrorBoundary: MockErrorBoundary,
    captureException: mockCaptureException,
  };
});

import { captureException } from '@sentry/react';
import { AppErrorBoundary } from '../../src/components/error/AppErrorBoundary';

const mockCaptureException = captureException as ReturnType<typeof vi.fn>;

function ThrowingComponent(): React.ReactElement {
  throw new Error('boom');
}

beforeEach(() => {
  vi.clearAllMocks();
});

// T014 — R004

describe('AppErrorBoundary — render error caught, reported, and fallback shown (R004)', () => {
  it('WHEN a child component throws during render THEN it renders ErrorFallback instead of unmounting and reports via Sentry', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    render(
      <AppErrorBoundary>
        <ThrowingComponent />
      </AppErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    expect(mockCaptureException).toHaveBeenCalledTimes(1);

    consoleErrorSpy.mockRestore();
  });
});
