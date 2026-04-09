import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PublicCustomerPortal from './PublicCustomerPortal';

const {
  getDoc,
  getDocs,
  collection,
  doc,
  query,
  where,
  limit,
} = vi.hoisted(() => ({
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
  auth: {
    currentUser: null,
  },
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
    getDoc.mockRejectedValueOnce(new Error('Missing or insufficient permissions.'));

    getDocs
      .mockResolvedValueOnce({
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
      })
      .mockResolvedValueOnce({ docs: [] })
      .mockResolvedValueOnce({ docs: [] });

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
    getDoc.mockResolvedValueOnce({
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
    });

    getDocs
      .mockResolvedValueOnce({ docs: [] })
      .mockResolvedValueOnce({ docs: [] });

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
});
