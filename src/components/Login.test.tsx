import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Login from './Login';
import { AUTH_REDIRECT_PENDING_KEY } from '../services/authUiState';

const { signInWithRedirect } = vi.hoisted(() => ({
  signInWithRedirect: vi.fn(),
}));

vi.mock('firebase/auth', () => ({
  signInWithRedirect,
}));

vi.mock('../firebase', () => ({
  auth: { currentUser: null },
  googleProvider: {},
}));

describe('Login', () => {
  beforeEach(() => {
    signInWithRedirect.mockReset();
    window.sessionStorage.clear();
  });

  it('uses redirect-based Google sign-in instead of a popup', async () => {
    signInWithRedirect.mockResolvedValue(undefined);

    render(<Login />);

    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }));

    expect(signInWithRedirect).toHaveBeenCalledTimes(1);
    expect(window.sessionStorage.getItem(AUTH_REDIRECT_PENDING_KEY)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Finishing Google sign-in...' })).toBeDisabled();
  });

  it('shows an explicit error if redirect setup fails before leaving the page', async () => {
    signInWithRedirect.mockRejectedValue(new Error('Redirect failed'));

    render(<Login />);

    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }));

    await waitFor(() => {
      expect(screen.getByText('Redirect failed')).toBeInTheDocument();
    });

    expect(window.sessionStorage.getItem(AUTH_REDIRECT_PENDING_KEY)).toBeNull();
    expect(screen.getByRole('button', { name: 'Sign in with Google' })).toBeEnabled();
  });

  it('keeps the login button in a finishing state while returning from Google', () => {
    window.sessionStorage.setItem(AUTH_REDIRECT_PENDING_KEY, new Date().toISOString());

    render(<Login />);

    expect(screen.getByRole('button', { name: 'Finishing Google sign-in...' })).toBeDisabled();
  });
});
