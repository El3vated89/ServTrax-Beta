import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PublicJobProof from './PublicJobProof';

const {
  getDoc,
  getDocs,
  collection,
  doc,
  query,
  where,
  orderBy,
  limit,
} = vi.hoisted(() => ({
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  collection: vi.fn(),
  doc: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
}));

vi.mock('../firebase', () => ({
  db: {},
}));

vi.mock('firebase/firestore', () => ({
  getDoc,
  getDocs,
  collection,
  doc,
  query,
  where,
  orderBy,
  limit,
}));

describe('PublicJobProof', () => {
  beforeEach(() => {
    getDoc.mockReset();
    getDocs.mockReset();
    collection.mockReset();
    doc.mockReset();
    query.mockReset();
    where.mockReset();
    orderBy.mockReset();
    limit.mockReset();

    collection.mockImplementation((_db, name) => name);
    doc.mockImplementation((_db, name, id) => `${name}/${id}`);
    query.mockImplementation((...parts) => parts);
    where.mockImplementation((field, op, value) => ({ field, op, value }));
    orderBy.mockImplementation((field, direction) => ({ field, direction }));
    limit.mockImplementation((value) => ({ limit: value }));
  });

  it('falls back to the token query with the shareable visibility filter when direct lookup fails', async () => {
    getDoc.mockImplementation(async (path: string) => {
      if (path === 'jobs/job-1') {
        throw new Error('Missing or insufficient permissions.');
      }

      return {
        exists: () => false,
        data: () => ({}),
      };
    });

    getDocs.mockImplementation(async (queryParts: any[]) => {
      if (queryParts.includes('jobs')) {
        return {
          empty: false,
          docs: [
            {
              id: 'job-1',
              data: () => ({
                customerId: 'customer-1',
                customer_name_snapshot: 'Acme Lawn',
                service_snapshot: 'Mowing',
                price_snapshot: 55,
                status: 'completed',
                payment_status: 'unpaid',
                visibility_mode: 'shareable',
                is_billable: true,
                share_token: 'share-token-1',
                completed_date: new Date('2026-04-08T10:00:00.000Z'),
              }),
            },
          ],
        };
      }

      if (queryParts.includes('verification_records')) {
        return { empty: true, docs: [] };
      }

      return { empty: true, docs: [] };
    });

    render(
      <MemoryRouter initialEntries={['/proof/job-1/share-token-1']}>
        <Routes>
          <Route path="/proof/:jobId/:shareToken" element={<PublicJobProof />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Mowing')).toBeInTheDocument();
    });

    expect(where).toHaveBeenCalledWith('share_token', '==', 'share-token-1');
    expect(where).toHaveBeenCalledWith('visibility_mode', '==', 'shareable');
  });
});
