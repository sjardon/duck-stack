import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ErrorFallback } from '../../src/components/error/ErrorFallback';

// T012 — EC004

describe('ErrorFallback — dependency-free error screen (EC004)', () => {
  it('WHEN rendered with no wrapping provider/context THEN it shows static heading, copy, and a reload button', () => {
    render(<ErrorFallback />);

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reload/i })).toBeInTheDocument();
  });

  it('WHEN the reload button is clicked THEN window.location.reload is called', async () => {
    const reloadMock = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { reload: reloadMock },
      configurable: true,
      writable: true,
    });

    const user = userEvent.setup();
    render(<ErrorFallback />);

    await user.click(screen.getByRole('button', { name: /reload/i }));

    expect(reloadMock).toHaveBeenCalledTimes(1);
  });
});
