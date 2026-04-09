import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Storage from './Storage';

const {
  auth,
  getUsageSummary,
  getAssets,
  syncStorageUsageForCurrentUser,
  subscribeToCurrentUsage,
  subscribeToJobs,
  subscribeToCustomers,
} = vi.hoisted(() => {
  const authState = {
    currentUser: { uid: 'owner-1' },
    onAuthStateChanged: vi.fn(),
  };

  authState.onAuthStateChanged.mockImplementation((callback: (user: any) => void) => {
    callback(authState.currentUser);
    return () => {};
  });

  return {
    auth: authState,
    getUsageSummary: vi.fn(),
    getAssets: vi.fn(),
    syncStorageUsageForCurrentUser: vi.fn(),
    subscribeToCurrentUsage: vi.fn(),
    subscribeToJobs: vi.fn(),
    subscribeToCustomers: vi.fn(),
  };
});

vi.mock('../firebase', () => ({
  auth,
}));

vi.mock('../services/StorageService', () => ({
  storageService: {
    getUsageSummary,
    getAssets,
    updateAsset: vi.fn(),
    deleteAsset: vi.fn(),
    bulkDeleteAssets: vi.fn(),
  },
}));

vi.mock('../services/usageTrackingService', () => ({
  usageTrackingService: {
    syncStorageUsageForCurrentUser,
    subscribeToCurrentUsage,
  },
}));

vi.mock('../services/jobService', () => ({
  jobService: {
    subscribeToJobs,
  },
}));

vi.mock('../services/customerService', () => ({
  customerService: {
    subscribeToCustomers,
  },
}));

vi.mock('motion/react', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
}));

describe('Storage', () => {
  beforeEach(() => {
    getUsageSummary.mockReset();
    getAssets.mockReset();
    syncStorageUsageForCurrentUser.mockReset();
    subscribeToCurrentUsage.mockReset();
    subscribeToJobs.mockReset();
    subscribeToCustomers.mockReset();

    getUsageSummary.mockResolvedValue({
      used_bytes: 0,
      limit_bytes: 0,
      asset_count: 0,
      plan_name: '',
      storage_cap: 0,
      retention_days: null,
    });
    getAssets.mockResolvedValue([]);
    syncStorageUsageForCurrentUser.mockResolvedValue(null);
    subscribeToCurrentUsage.mockImplementation((callback: (usage: any) => void) => {
      callback(null);
      return () => {};
    });
    subscribeToJobs.mockImplementation((callback: (jobs: any[]) => void) => {
      callback([]);
      return () => {};
    });
    subscribeToCustomers.mockImplementation((callback: (customers: any[]) => void) => {
      callback([]);
      return () => {};
    });
  });

  it('shows 0% full instead of NaN when the storage limit has not loaded yet', async () => {
    render(<Storage />);

    await waitFor(() => {
      expect(screen.getByText('0% Full')).toBeInTheDocument();
    });

    expect(screen.queryByText('NaN% Full')).not.toBeInTheDocument();
  });
});
