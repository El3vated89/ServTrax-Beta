import type { ReactNode } from 'react';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';

const {
  onAuthStateChanged,
  getRedirectResult,
  initializeDefaultServices,
  ensureCurrentUserProfile,
  hydrateFramework,
  syncStorageUsageForCurrentUser,
  repairEnabledPortalsForCurrentUser,
} = vi.hoisted(() => ({
  onAuthStateChanged: vi.fn(),
  getRedirectResult: vi.fn(),
  initializeDefaultServices: vi.fn(),
  ensureCurrentUserProfile: vi.fn(),
  hydrateFramework: vi.fn(),
  syncStorageUsageForCurrentUser: vi.fn(),
  repairEnabledPortalsForCurrentUser: vi.fn(),
}));

vi.mock('firebase/auth', () => ({
  onAuthStateChanged,
  getRedirectResult,
}));

vi.mock('./firebase', () => ({
  auth: {},
}));

vi.mock('./components/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('./components/Login', () => ({
  default: () => <div>LOGIN_SCREEN</div>,
}));

vi.mock('./components/Layout', () => ({
  default: () => <div>APP_LAYOUT</div>,
}));

vi.mock('./components/Dashboard', () => ({
  default: () => <div>DASHBOARD</div>,
}));

vi.mock('./components/Customers', () => ({
  default: () => <div>CUSTOMERS</div>,
}));

vi.mock('./components/Jobs', () => ({
  default: () => <div>JOBS</div>,
}));

vi.mock('./components/Equip', () => ({
  default: () => <div>EQUIP</div>,
}));

vi.mock('./modules/routes/ActiveRoutePage', () => ({
  default: () => <div>ACTIVE_ROUTE</div>,
}));

vi.mock('./modules/routes/RoutesManagementPage', () => ({
  default: () => <div>ROUTES_MANAGEMENT</div>,
}));

vi.mock('./components/PublicJobProof', () => ({
  default: () => <div>PUBLIC_PROOF</div>,
}));

vi.mock('./components/PublicCustomerPortal', () => ({
  default: () => <div>PUBLIC_PORTAL</div>,
}));

vi.mock('./components/Messaging', () => ({
  default: () => <div>MESSAGING</div>,
}));

vi.mock('./components/Billing', () => ({
  default: () => <div>BILLING</div>,
}));

vi.mock('./components/Expenses', () => ({
  default: () => <div>EXPENSES</div>,
}));

vi.mock('./components/Supplies', () => ({
  default: () => <div>SUPPLIES</div>,
}));

vi.mock('./components/Storage', () => ({
  default: () => <div>STORAGE</div>,
}));

vi.mock('./components/Settings', () => ({
  default: () => <div>SETTINGS</div>,
}));

vi.mock('./components/Alerts', () => ({
  default: () => <div>ALERTS</div>,
}));

vi.mock('./components/Profile', () => ({
  default: () => <div>PROFILE</div>,
}));

vi.mock('./components/AdminController', () => ({
  default: () => <div>ADMIN_CONTROLLER</div>,
}));

vi.mock('./services/servicePlanService', () => ({
  servicePlanService: {
    initializeDefaultServices,
  },
}));

vi.mock('./services/userProfileService', () => ({
  userProfileService: {
    ensureCurrentUserProfile,
  },
}));

vi.mock('./services/planConfigService', () => ({
  planConfigService: {
    hydrateFramework,
  },
}));

vi.mock('./services/usageTrackingService', () => ({
  usageTrackingService: {
    syncStorageUsageForCurrentUser,
  },
}));

vi.mock('./services/customerPortalService', () => ({
  customerPortalService: {
    repairEnabledPortalsForCurrentUser,
  },
}));

describe('App Safari-safe bootstrap', () => {
  beforeEach(() => {
    window.location.hash = '';
    onAuthStateChanged.mockReset();
    getRedirectResult.mockReset().mockResolvedValue(null);
    initializeDefaultServices.mockReset().mockResolvedValue(undefined);
    ensureCurrentUserProfile.mockReset().mockResolvedValue(undefined);
    hydrateFramework.mockReset().mockResolvedValue(undefined);
    syncStorageUsageForCurrentUser.mockReset().mockResolvedValue(undefined);
    repairEnabledPortalsForCurrentUser.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the login route immediately even if auth bootstrap has not resolved yet', () => {
    onAuthStateChanged.mockImplementation(() => () => {});
    window.location.hash = '#/login';

    render(<App />);

    expect(screen.getByText('LOGIN_SCREEN')).toBeInTheDocument();
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
  });

  it('releases the app shell after an auth bootstrap timeout instead of hanging forever', async () => {
    vi.useFakeTimers();
    onAuthStateChanged.mockImplementation(() => () => {});
    window.location.hash = '#/';

    render(<App />);

    expect(screen.getByText('Loading...')).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    expect(screen.getByText('LOGIN_SCREEN')).toBeInTheDocument();
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
  });
});
