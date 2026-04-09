import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Login from './Login';
import { AUTH_REDIRECT_PENDING_KEY, clearAuthRedirectPending } from '../services/authUiState';

const { signInWithPopup, signInWithRedirect } = vi.hoisted(() => ({
  signInWithPopup: vi.fn(),
  signInWithRedirect: vi.fn(),
}));

vi.mock('firebase/auth', () => ({
  signInWithPopup,
  signInWithRedirect,
}));

vi.mock('../firebase', () => ({
  auth: { currentUser: null },
  googleProvider: {},
}));

describe('Login', () => {
  beforeEach(() => {
    signInWithPopup.mockReset();
    signInWithRedirect.mockReset();
    window.sessionStorage.clear();
  });

  it('uses popup-based Google sign-in first', async () => {
    signInWithPopup.mockResolvedValue(undefined);

    render(<Login />);

    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }));

    expect(signInWithPopup).toHaveBeenCalledTimes(1);
    expect(signInWithRedirect).not.toHaveBeenCalled();
  });

  it('shows an explicit error if redirect setup fails before leaving the page', async () => {
    signInWithPopup.mockRejectedValue(new Error('Popup failed'));

    render(<Login />);

    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }));

    await waitFor(() => {
      expect(screen.getByText('Popup failed')).toBeInTheDocument();
    });

    expect(window.sessionStorage.getItem(AUTH_REDIRECT_PENDING_KEY)).toBeNull();
    expect(screen.getByRole('button', { name: 'Sign in with Google' })).toBeEnabled();
  });

  it('falls back to redirect when popup sign-in is blocked', async () => {
    signInWithPopup.mockRejectedValue({ code: 'auth/popup-blocked' });
    signInWithRedirect.mockResolvedValue(undefined);

    render(<Login />);

    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }));

    await waitFor(() => {
      expect(signInWithRedirect).toHaveBeenCalledTimes(1);
    });

    expect(window.sessionStorage.getItem(AUTH_REDIRECT_PENDING_KEY)).toBeTruthy();
  });

  it('keeps the login button in a finishing state while returning from Google', () => {
    window.sessionStorage.setItem(AUTH_REDIRECT_PENDING_KEY, new Date().toISOString());

    render(<Login />);

    expect(screen.getByRole('button', { name: 'Finishing Google sign-in...' })).toBeDisabled();
  });

  it('re-enables login when the redirect pending flag is cleared after return', async () => {
    window.sessionStorage.setItem(AUTH_REDIRECT_PENDING_KEY, new Date().toISOString());

    render(<Login />);

    expect(screen.getByRole('button', { name: 'Finishing Google sign-in...' })).toBeDisabled();

    await act(async () => {
      clearAuthRedirectPending();
    });

    expect(screen.getByRole('button', { name: 'Sign in with Google' })).toBeEnabled();
  });
});
