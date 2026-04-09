import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PublicCustomerPortal from './PublicCustomerPortal';
import { customerPortalService } from '../services/customerPortalService';

const {
  auth,
  getDoc,
  getDocs,
  collection,
  doc,
  query,
  where,
  limit,
} = vi.hoisted(() => ({
  auth: {
    currentUser: null as { uid: string } | null,
    _listeners: [] as Array<(user: { uid: string } | null) => void>,
    onAuthStateChanged(callback: (user: { uid: string } | null) => void) {
      this._listeners.push(callback);
      callback(this.currentUser);
      return () => {
        this._listeners = this._listeners.filter((entry) => entry !== callback);
      };
    },
  },
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  collection: vi.fn(),
  doc: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  limit: vi.fn(),
}));

vi.mock('../firebase', () => ({
  db: {},
  auth,
}));

vi.mock('firebase/firestore', () => ({
  getDoc,
  getDocs,
  collection,
  doc,
  query,
  where,
  limit,
}));

describe('PublicCustomerPortal', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    auth.currentUser = null;
    auth._listeners = [];
    getDoc.mockReset();
    getDocs.mockReset();
    collection.mockReset();
    doc.mockReset();
    query.mockReset();
    where.mockReset();
    limit.mockReset();

    collection.mockImplementation((_db, name) => name);
    doc.mockImplementation((_db, name, id) => `${name}/${id}`);
    query.mockImplementation((...parts) => parts);
    where.mockImplementation((field, op, value) => ({ field, op, value }));
    limit.mockImplementation((value) => ({ limit: value }));
    window.sessionStorage.clear();
  });

  it('falls back to the legacy token lookup when the direct public portal read is denied', async () => {
    getDoc.mockImplementation(async (path: string) => {
      if (path === 'public_customer_portals/portal-token-1') {
        throw new Error('Missing or insufficient permissions.');
      }

      return {
        exists: () => false,
        data: () => ({}),
      };
    });

    getDocs.mockImplementation(async (queryParts: any[]) => {
      const hasPublicPortalCollection = queryParts.includes('public_customer_portals');
      const hasHistoryCollection = queryParts.includes('public_customer_portal_job_history');
      const hasQuotesCollection = queryParts.includes('public_customer_portal_quotes');

      if (hasPublicPortalCollection) {
        return {
          empty: false,
          docs: [
            {
              id: 'portal-record',
              data: () => ({
                customerId: 'customer-1',
                ownerId: 'owner-1',
                portal_enabled: true,
                portal_token: 'portal-token-1',
                portal_show_history: true,
                portal_show_payment_status: false,
                portal_show_quotes: true,
                portal_plan_name_snapshot: 'Free',
                customer_name_snapshot: 'Acme Lawn',
                address_snapshot: '123 Main St',
              }),
            },
          ],
        };
      }

      if (hasHistoryCollection || hasQuotesCollection) {
        return { docs: [] };
      }

      return { empty: true, docs: [] };
    });

    render(
      <MemoryRouter initialEntries={['/portal/customer-1/portal-token-1']}>
        <Routes>
          <Route path="/portal/:customerId/:portalToken" element={<PublicCustomerPortal />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Acme Lawn')).toBeInTheDocument();
    });

    expect(where).toHaveBeenCalledWith('portal_enabled', '==', true);
    expect(screen.queryByText('Portal Unavailable')).not.toBeInTheDocument();
  });

  it('opens when the token is valid even if the customer id segment is stale', async () => {
    getDoc.mockImplementation(async (path: string) => {
      if (path === 'public_customer_portals/portal-token-2') {
        return {
          exists: () => true,
          data: () => ({
            customerId: 'customer-live',
            ownerId: 'owner-1',
            portal_enabled: true,
            portal_token: 'portal-token-2',
            portal_show_history: true,
            portal_show_payment_status: false,
            portal_show_quotes: true,
            portal_plan_name_snapshot: 'Free',
            customer_name_snapshot: 'Portal Customer',
            address_snapshot: '456 Main St',
          }),
        };
      }

      return {
        exists: () => false,
        data: () => ({}),
      };
    });

    getDocs.mockResolvedValue({ docs: [], empty: true });

    render(
      <MemoryRouter initialEntries={['/portal/customer-stale/portal-token-2']}>
        <Routes>
          <Route path="/portal/:customerId/:portalToken" element={<PublicCustomerPortal />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Portal Customer')).toBeInTheDocument();
    });

    expect(screen.queryByText('Portal Unavailable')).not.toBeInTheDocument();
  });

  it('waits for auth hydration and opens internal preview when the owner session resolves after first render', async () => {
    getDoc.mockImplementation(async (path: string) => {
      if (path === 'public_customer_portals/portal-token-preview') {
        return {
          exists: () => false,
          data: () => ({}),
        };
      }

      if (path === 'customer_portals/customer-1') {
        return {
          exists: () => true,
          data: () => ({
            customerId: 'customer-1',
            ownerId: 'owner-1',
            portal_enabled: true,
            portal_token: 'portal-token-preview',
            portal_show_history: true,
            portal_show_payment_status: false,
            portal_show_quotes: true,
            portal_plan_name_snapshot: 'Free',
            customer_name_snapshot: 'Preview Customer',
            address_snapshot: '789 Main St',
          }),
        };
      }

      return {
        exists: () => false,
        data: () => ({}),
      };
    });

    getDocs.mockResolvedValue({ empty: true, docs: [] });

    render(
      <MemoryRouter initialEntries={['/portal/customer-1/portal-token-preview']}>
        <Routes>
          <Route path="/portal/:customerId/:portalToken" element={<PublicCustomerPortal />} />
        </Routes>
      </MemoryRouter>
    );

    await act(async () => {
      auth.currentUser = { uid: 'owner-1' };
      auth._listeners.forEach((listener) => listener(auth.currentUser));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getByText('Preview Customer')).toBeInTheDocument();
    });

    expect(screen.getByText('Preview Customer')).toBeInTheDocument();
  });

  it('opens the internal preview from a token-only portal link when the owner is signed in', async () => {
    getDoc.mockImplementation(async (path: string) => {
      if (path === 'public_customer_portals/portal-token-preview-token-only') {
        return {
          exists: () => false,
          data: () => ({}),
        };
      }

      return {
        exists: () => false,
        data: () => ({}),
      };
    });

    getDocs.mockImplementation(async (queryParts: any[]) => {
      if (queryParts.includes('customer_portals')) {
        return {
          empty: false,
          docs: [
            {
              id: 'customer-7',
              data: () => ({
                customerId: 'customer-7',
                ownerId: 'owner-1',
                portal_enabled: true,
                portal_token: 'portal-token-preview-token-only',
                portal_show_history: true,
                portal_show_payment_status: false,
                portal_show_quotes: false,
                portal_plan_name_snapshot: 'Free',
                customer_name_snapshot: 'Token Only Preview',
                address_snapshot: '900 Main St',
              }),
            },
          ],
        };
      }

      return { empty: true, docs: [] };
    });

    render(
      <MemoryRouter initialEntries={['/portal/portal-token-preview-token-only']}>
        <Routes>
          <Route path="/portal/:portalToken" element={<PublicCustomerPortal />} />
        </Routes>
      </MemoryRouter>
    );

    await act(async () => {
      auth.currentUser = { uid: 'owner-1' };
      auth._listeners.forEach((listener) => listener(auth.currentUser));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getByText('Token Only Preview')).toBeInTheDocument();
    });

    expect(where).toHaveBeenCalledWith('ownerId', '==', 'owner-1');
    expect(where).toHaveBeenCalledWith('portal_token', '==', 'portal-token-preview-token-only');
  });

  it('opens the phone gate with a valid phone number and persists the session flag', async () => {
    const validHash = 'phone-hash-1';
    vi.spyOn(customerPortalService, 'hashPhoneForPortal').mockResolvedValue(validHash);

    getDoc.mockImplementation(async (path: string) => {
      if (path === 'public_customer_portals/portal-token-phone') {
        return {
          exists: () => true,
          data: () => ({
            customerId: 'customer-1',
            ownerId: 'owner-1',
            portal_enabled: true,
            portal_token: 'portal-token-phone',
            portal_access_mode: 'phone_only_temporary',
            portal_phone_hash: validHash,
            portal_phone_last4: '7890',
            portal_show_history: true,
            portal_show_payment_status: false,
            portal_show_quotes: false,
            portal_plan_name_snapshot: 'Free',
            customer_name_snapshot: 'Phone Customer',
            address_snapshot: '123 Main St',
          }),
        };
      }

      return {
        exists: () => false,
        data: () => ({}),
      };
    });

    getDocs.mockResolvedValue({ docs: [], empty: true });

    render(
      <MemoryRouter initialEntries={['/portal/portal-token-phone']}>
        <Routes>
          <Route path="/portal/:portalToken" element={<PublicCustomerPortal />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Open Customer Portal')).toBeInTheDocument();
    });

    await userEvent.type(screen.getByPlaceholderText('Enter phone number'), '555-123-7890');
    await userEvent.click(screen.getByRole('button', { name: 'Open Portal' }));

    await waitFor(() => {
      expect(screen.getByText('Phone Customer')).toBeInTheDocument();
    });

    expect(window.sessionStorage.getItem('portal-phone-ok-portal-token-phone')).toBe('1');
  });

  it('shows an explicit error when the wrong phone number is entered', async () => {
    const expectedHash = 'expected-hash';
    vi.spyOn(customerPortalService, 'hashPhoneForPortal').mockResolvedValue('wrong-hash');

    getDoc.mockImplementation(async (path: string) => {
      if (path === 'public_customer_portals/portal-token-invalid-phone') {
        return {
          exists: () => true,
          data: () => ({
            customerId: 'customer-2',
            ownerId: 'owner-1',
            portal_enabled: true,
            portal_token: 'portal-token-invalid-phone',
            portal_access_mode: 'phone_only_temporary',
            portal_phone_hash: expectedHash,
            portal_phone_last4: '1234',
            portal_show_history: true,
            portal_show_payment_status: false,
            portal_show_quotes: false,
            portal_plan_name_snapshot: 'Free',
            customer_name_snapshot: 'Blocked Customer',
            address_snapshot: '456 Main St',
          }),
        };
      }

      return {
        exists: () => false,
        data: () => ({}),
      };
    });

    getDocs.mockResolvedValue({ docs: [], empty: true });

    render(
      <MemoryRouter initialEntries={['/portal/portal-token-invalid-phone']}>
        <Routes>
          <Route path="/portal/:portalToken" element={<PublicCustomerPortal />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Open Customer Portal')).toBeInTheDocument();
    });

    await userEvent.type(screen.getByPlaceholderText('Enter phone number'), '555-000-0000');
    await userEvent.click(screen.getByRole('button', { name: 'Open Portal' }));

    await waitFor(() => {
      expect(screen.getByText('That phone number does not match this customer portal.')).toBeInTheDocument();
    });

    expect(screen.queryByText('Blocked Customer')).not.toBeInTheDocument();
  });

  it('reuses the session flag so the phone gate does not reappear in the same session', async () => {
    window.sessionStorage.setItem('portal-phone-ok-portal-token-session', '1');

    getDoc.mockImplementation(async (path: string) => {
      if (path === 'public_customer_portals/portal-token-session') {
        return {
          exists: () => true,
          data: () => ({
            customerId: 'customer-session',
            ownerId: 'owner-1',
            portal_enabled: true,
            portal_token: 'portal-token-session',
            portal_access_mode: 'phone_only_temporary',
            portal_phone_hash: 'any-hash',
            portal_phone_last4: '1111',
            portal_show_history: true,
            portal_show_payment_status: false,
            portal_show_quotes: false,
            portal_plan_name_snapshot: 'Free',
            customer_name_snapshot: 'Session Customer',
            address_snapshot: '100 Session St',
          }),
        };
      }

      return {
        exists: () => false,
        data: () => ({}),
      };
    });

    getDocs.mockResolvedValue({ docs: [], empty: true });

    render(
      <MemoryRouter initialEntries={['/portal/portal-token-session']}>
        <Routes>
          <Route path="/portal/:portalToken" element={<PublicCustomerPortal />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Session Customer')).toBeInTheDocument();
    });

    expect(screen.queryByText('Open Customer Portal')).not.toBeInTheDocument();
  });

  it('shows the no-data message when the portal shell loads without customer-visible content', async () => {
    getDoc.mockImplementation(async (path: string) => {
      if (path === 'public_customer_portals/portal-token-empty') {
        return {
          exists: () => true,
          data: () => ({
            customerId: 'customer-empty',
            ownerId: 'owner-1',
            portal_enabled: true,
            portal_token: 'portal-token-empty',
            portal_show_history: true,
            portal_show_payment_status: false,
            portal_show_quotes: true,
            portal_plan_name_snapshot: 'Free',
            customer_name_snapshot: 'Empty Portal Customer',
            address_snapshot: '200 Empty St',
          }),
        };
      }

      return {
        exists: () => false,
        data: () => ({}),
      };
    });

    getDocs.mockResolvedValue({ docs: [], empty: true });

    render(
      <MemoryRouter initialEntries={['/portal/portal-token-empty']}>
        <Routes>
          <Route path="/portal/:portalToken" element={<PublicCustomerPortal />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Empty Portal Customer')).toBeInTheDocument();
    });

    expect(screen.getByText('No customer-visible proof history is available right now.')).toBeInTheDocument();
    expect(screen.getByText('No customer-visible quotes are available right now.')).toBeInTheDocument();
  });

  it('shows the explicit unavailable state when no public or preview portal record can be found', async () => {
    getDoc.mockResolvedValue({
      exists: () => false,
      data: () => ({}),
    });
    getDocs.mockResolvedValue({ docs: [], empty: true });

    render(
      <MemoryRouter initialEntries={['/portal/unknown-token']}>
        <Routes>
          <Route path="/portal/:portalToken" element={<PublicCustomerPortal />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Portal Unavailable')).toBeInTheDocument();
    });

    expect(screen.getByText('Customer portal not found.')).toBeInTheDocument();
  });
});
