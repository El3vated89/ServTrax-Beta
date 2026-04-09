import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PublicCustomerPortal from './PublicCustomerPortal';

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
});
