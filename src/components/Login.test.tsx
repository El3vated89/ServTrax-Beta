import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Login from './Login';

const { signInWithRedirect } = vi.hoisted(() => ({
  signInWithRedirect: vi.fn(),
}));

vi.mock('firebase/auth', () => ({
  signInWithRedirect,
}));

vi.mock('../firebase', () => ({
  auth: {},
  googleProvider: {},
}));

describe('Login', () => {
  beforeEach(() => {
    signInWithRedirect.mockReset();
  });

  it('uses redirect-based Google sign-in instead of a popup', async () => {
    signInWithRedirect.mockResolvedValue(undefined);

    render(<Login />);

    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }));

    expect(signInWithRedirect).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Redirecting to Google...' })).toBeDisabled();
  });

  it('shows an explicit error if redirect setup fails before leaving the page', async () => {
    signInWithRedirect.mockRejectedValue(new Error('Redirect failed'));

    render(<Login />);

    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }));

    await waitFor(() => {
      expect(screen.getByText('Redirect failed')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: 'Sign in with Google' })).toBeEnabled();
  });
});
