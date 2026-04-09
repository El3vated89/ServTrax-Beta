import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  auth,
  addDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  collection,
  docRef,
  query,
  where,
  serverTimestamp,
  onSnapshot,
} = vi.hoisted(() => ({
  auth: {
    currentUser: { uid: 'owner-1', email: 'owner@example.com' },
    onAuthStateChanged: vi.fn(() => () => {}),
  },
  addDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  collection: vi.fn(() => ({ __type: 'collection' })),
  docRef: vi.fn(() => ({ __type: 'doc' })),
  query: vi.fn((...args: unknown[]) => ({ args })),
  where: vi.fn((...args: unknown[]) => ({ args })),
  serverTimestamp: vi.fn(() => 'server-timestamp'),
  onSnapshot: vi.fn(),
}));

vi.mock('../firebase', () => ({
  db: {},
  auth,
}));

vi.mock('firebase/firestore', () => ({
  addDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  collection,
  doc: docRef,
  query,
  where,
  serverTimestamp,
  onSnapshot,
}));

import { customerService } from './customerService';
import { expenseService } from './expenseService';
import { jobService } from './jobService';
import { servicePlanService } from './servicePlanService';

const never = () => new Promise<never>(() => {});
const readLocalFallback = <T>(namespace: string) =>
  JSON.parse(window.localStorage.getItem(`servtrax:fallback:${namespace}:owner-1`) || '[]') as T[];

describe('core cloud-truth save handling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.clear();
    auth.currentUser = { uid: 'owner-1', email: 'owner@example.com' } as any;

    addDoc.mockReset();
    updateDoc.mockReset();
    deleteDoc.mockReset();
    getDoc.mockReset();
    getDocs.mockReset();
    collection.mockClear();
    docRef.mockClear();
    query.mockClear();
    where.mockClear();
    serverTimestamp.mockClear();
    onSnapshot.mockReset();

    getDoc.mockResolvedValue({
      exists: () => false,
      data: () => ({}),
    });
    getDocs.mockResolvedValue({
      docs: [],
      empty: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not store a local backup when customer creation stalls', async () => {
    addDoc.mockImplementation(() => never());

    const promise = customerService.addCustomer({
      name: 'Acme',
      phone: '5551112222',
      email: 'acme@example.com',
      street: '123 Main',
      city: 'Tampa',
      state: 'FL',
      zip: '33601',
      notes: '',
      status: 'active',
    });
    const rejection = expect(promise).rejects.toThrow('Client could not be saved to the shared database.');

    await vi.advanceTimersByTimeAsync(15001);
    await rejection;
    expect(readLocalFallback<any>('customers')).toEqual([]);
  });

  it('does not store a local backup when customer updates stall', async () => {
    updateDoc.mockImplementation(() => never());

    const promise = customerService.updateCustomer('cust-1', {
      name: 'Updated Client',
      phone: '5550000000',
    });
    const rejection = expect(promise).rejects.toThrow('Client could not be updated in the shared database.');

    await vi.advanceTimersByTimeAsync(15001);
    await rejection;

    expect(readLocalFallback<any>('customers')).toEqual([]);
  });

  it('does not store a local backup when service plan creation stalls', async () => {
    addDoc.mockImplementation(() => never());

    const promise = servicePlanService.addServicePlan({
      name: 'Weekly Mow',
      description: 'Weekly lawn mowing',
      price: 55,
      billing_frequency: 'weekly',
      requires_photos: true,
      seasonal_enabled: false,
      seasonal_rules: [],
    });
    const rejection = expect(promise).rejects.toThrow('Service could not be saved to the shared database.');

    await vi.advanceTimersByTimeAsync(15001);
    await rejection;
    expect(readLocalFallback<any>('service_plans')).toEqual([]);
  });

  it('does not store a local backup when job creation stalls', async () => {
    addDoc.mockImplementation(() => never());

    const promise = jobService.addJob({
      customerId: 'cust-1',
      customer_name_snapshot: 'Acme',
      address_snapshot: '123 Main',
      phone_snapshot: '5551112222',
      service_snapshot: 'Mowing',
      price_snapshot: 55,
      status: 'approved',
      payment_status: 'unpaid',
      visibility_mode: 'internal_only',
      is_billable: true,
      is_recurring: false,
      internal_notes: '',
      customer_notes: '',
      billing_frequency: 'weekly',
    });
    const rejection = expect(promise).rejects.toThrow('Job could not be saved to the shared database.');

    await vi.advanceTimersByTimeAsync(15001);
    await rejection;
    expect(readLocalFallback<any>('jobs')).toEqual([]);
  });

  it('does not store a local backup when job updates stall', async () => {
    updateDoc.mockImplementation(() => never());

    const promise = jobService.updateJob('job-1', {
      internal_notes: 'Updated notes',
      status: 'delayed',
    });
    const rejection = expect(promise).rejects.toThrow('Job could not be updated in the shared database.');

    await vi.advanceTimersByTimeAsync(15001);
    await rejection;

    expect(readLocalFallback<any>('jobs')).toEqual([]);
  });

  it('does not store a local backup when expense creation stalls', async () => {
    addDoc.mockImplementation(() => never());

    const promise = expenseService.addExpense({
      title: 'Fuel',
      category: 'fuel',
      amount: 42,
      vendor: 'Gas Station',
      notes: 'Truck fuel',
      expense_date: '2026-04-08T00:00:00.000Z',
      is_recurring: false,
      recurrence_frequency: 'none',
      next_due_date: null,
      status: 'active',
    });
    const rejection = expect(promise).rejects.toThrow('Expense could not be saved to the shared database.');

    await vi.advanceTimersByTimeAsync(15001);
    await rejection;
    expect(readLocalFallback<any>('expenses')).toEqual([]);
  });
});
