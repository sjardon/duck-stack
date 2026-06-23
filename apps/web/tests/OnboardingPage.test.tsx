import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Mock navigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock useCompleteOnboarding
const mockMutate = vi.fn();
let mutationOnSuccess: ((data: unknown) => void) | undefined;

vi.mock('../src/hooks/use-user-profile', () => ({
  useCompleteOnboarding: vi.fn(() => ({
    mutate: mockMutate,
    isPending: false,
  })),
}));

import OnboardingPage from '../src/pages/onboarding/OnboardingPage';
import { useCompleteOnboarding } from '../src/hooks/use-user-profile';

const mockUseCompleteOnboarding = useCompleteOnboarding as ReturnType<typeof vi.fn>;

function renderPage() {
  return render(
    <MemoryRouter>
      <OnboardingPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockMutate.mockReset();
  mutationOnSuccess = undefined;
  mockUseCompleteOnboarding.mockReturnValue({ mutate: mockMutate, isPending: false });
});

describe('OnboardingPage', () => {
  it('(R009) renders welcome heading and three input fields plus submit button', () => {
    renderPage();

    expect(screen.getByRole('heading')).toBeInTheDocument();
    expect(screen.getByLabelText(/job role/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/company size/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/primary use case/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /submit|continue|get started/i })).toBeInTheDocument();
  });

  it('(R010) submitting the form calls mutation with the correct payload', async () => {
    renderPage();

    fireEvent.change(screen.getByLabelText(/job role/i), { target: { value: 'Engineer' } });
    fireEvent.change(screen.getByLabelText(/company size/i), { target: { value: '11-50' } });
    fireEvent.change(screen.getByLabelText(/primary use case/i), { target: { value: 'Build tools' } });
    fireEvent.click(screen.getByRole('button', { name: /submit|continue|get started/i }));

    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledWith(
        { job_role: 'Engineer', company_size: '11-50', primary_use_case: 'Build tools' },
        expect.any(Object),
      );
    });
  });

  it('(R011) navigates to / on mutation success', async () => {
    mockUseCompleteOnboarding.mockReturnValue({ mutate: mockMutate, isPending: false });

    // Capture onSuccess callback when mutate is called
    mockMutate.mockImplementation((_data: unknown, options: { onSuccess?: () => void }) => {
      if (options?.onSuccess) {
        options.onSuccess();
      }
    });

    renderPage();

    fireEvent.change(screen.getByLabelText(/job role/i), { target: { value: 'Engineer' } });
    fireEvent.change(screen.getByLabelText(/company size/i), { target: { value: '11-50' } });
    fireEvent.change(screen.getByLabelText(/primary use case/i), { target: { value: 'Build tools' } });
    fireEvent.click(screen.getByRole('button', { name: /submit|continue|get started/i }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/');
    });
  });

  it('(EC002) submit button is disabled when a required field is missing', async () => {
    renderPage();

    fireEvent.change(screen.getByLabelText(/job role/i), { target: { value: 'Engineer' } });
    // Leave company_size and primary_use_case empty

    const submitButton = screen.getByRole('button', { name: /submit|continue|get started/i });
    expect(submitButton).toBeDisabled();
  });

  it('(EC003) submit button is disabled when a field has only whitespace / empty string', async () => {
    renderPage();

    fireEvent.change(screen.getByLabelText(/job role/i), { target: { value: '   ' } });
    fireEvent.change(screen.getByLabelText(/company size/i), { target: { value: '11-50' } });
    fireEvent.change(screen.getByLabelText(/primary use case/i), { target: { value: 'Build tools' } });

    const submitButton = screen.getByRole('button', { name: /submit|continue|get started/i });
    expect(submitButton).toBeDisabled();
  });
});
