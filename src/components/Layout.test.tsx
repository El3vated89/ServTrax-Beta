import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Layout from './Layout';

const {
  auth,
  signOut,
  subscribeToJobs,
  subscribeToRoutes,
  subscribeToAllRouteStops,
  subscribeToQuotes,
  getUsageSummary,
  buildOperationalAlerts,
  subscribeToCurrentUserProfile,
  isPlatformAdmin,
  hasPermission,
  createBugReport,
} = vi.hoisted(() => {
  const authState = {
    currentUser: {
      uid: 'owner-1',
      email: 'owner@example.com',
      displayName: 'Owner',
    },
    onAuthStateChanged: vi.fn(),
  };

  authState.onAuthStateChanged.mockImplementation((callback: (user: any) => void) => {
    callback(authState.currentUser);
    return () => {};
  });

  return {
    auth: authState,
    signOut: vi.fn(),
    subscribeToJobs: vi.fn(),
    subscribeToRoutes: vi.fn(),
    subscribeToAllRouteStops: vi.fn(),
    subscribeToQuotes: vi.fn(),
    getUsageSummary: vi.fn(),
    buildOperationalAlerts: vi.fn(),
    subscribeToCurrentUserProfile: vi.fn(),
    isPlatformAdmin: vi.fn(),
    hasPermission: vi.fn(),
    createBugReport: vi.fn(),
  };
});

vi.mock('../firebase', () => ({
  auth,
}));

vi.mock('firebase/auth', () => ({
  signOut,
}));

vi.mock('../services/jobService', () => ({
  jobService: {
    subscribeToJobs,
  },
}));

vi.mock('../services/RouteService', () => ({
  routeService: {
    subscribeToRoutes,
    subscribeToAllRouteStops,
  },
}));

vi.mock('../services/StorageService', () => ({
  storageService: {
    getUsageSummary,
  },
}));

vi.mock('../services/alertService', () => ({
  alertService: {
    buildOperationalAlerts,
  },
}));

vi.mock('../services/userProfileService', () => ({
  userProfileService: {
    subscribeToCurrentUserProfile,
    isPlatformAdmin,
    hasPermission,
  },
}));

vi.mock('../services/quoteService', () => ({
  quoteService: {
    subscribeToQuotes,
  },
}));

vi.mock('../services/bugReportService', () => ({
  bugReportService: {
    categories: [
      { value: 'ui_layout', label: 'UI / Layout' },
      { value: 'save_error', label: 'Save Error' },
    ],
    createBugReport,
    prepareScreenshot: vi.fn(),
  },
}));

describe('Layout report modal', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    signOut.mockReset();
    subscribeToJobs.mockReset();
    subscribeToRoutes.mockReset();
    subscribeToAllRouteStops.mockReset();
    subscribeToQuotes.mockReset();
    getUsageSummary.mockReset();
    buildOperationalAlerts.mockReset();
    subscribeToCurrentUserProfile.mockReset();
    isPlatformAdmin.mockReset();
    hasPermission.mockReset();
    createBugReport.mockReset();

    subscribeToJobs.mockImplementation((callback) => {
      callback([]);
      return () => {};
    });
    subscribeToRoutes.mockImplementation((callback) => {
      callback([]);
      return () => {};
    });
    subscribeToAllRouteStops.mockImplementation((callback) => {
      callback([]);
      return () => {};
    });
    subscribeToQuotes.mockImplementation((callback) => {
      callback([]);
      return () => {};
    });
    getUsageSummary.mockResolvedValue({ used_bytes: 0, limit_bytes: 0 });
    buildOperationalAlerts.mockReturnValue([]);
    subscribeToCurrentUserProfile.mockImplementation((callback) => {
      callback({ name: 'Owner', email: 'owner@example.com', role: 'owner' });
      return () => {};
    });
    isPlatformAdmin.mockReturnValue(false);
    hasPermission.mockReturnValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('clears sending state and shows an explicit error when bug report save times out', async () => {
    createBugReport.mockImplementation(() => new Promise(() => {}));

    const { container } = render(
      <MemoryRouter initialEntries={['/jobs']}>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/jobs" element={<div>Jobs Page</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: /report/i }));
    fireEvent.change(screen.getByPlaceholderText(/describe the problem/i), { target: { value: 'Bug report detail' } });
    fireEvent.click(screen.getByRole('button', { name: /send report/i }));

    expect(screen.getByRole('button', { name: /sending/i })).toBeDisabled();
    expect(container.querySelector('form.flex-1.overflow-y-auto')).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(25001);
      await Promise.resolve();
    });

    expect(screen.getByText('Bug report save took too long and was stopped. Please try again.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send report/i })).toBeEnabled();
  }, 15000);

  it('shows a persistent AI dispatcher entry in the top header', () => {
    render(
      <MemoryRouter initialEntries={['/jobs']}>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/jobs" element={<div>Jobs Page</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByRole('link', { name: /ai dispatcher/i })).toBeInTheDocument();
  });
});
