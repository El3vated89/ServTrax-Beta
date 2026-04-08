import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Billing from './Billing';

const {
  subscribeToBillingRecords,
  subscribeToPaymentEntries,
  recordManualPayment,
  addPaymentEntry,
  addBillingRecord,
  autoGenerateBillingRecords,
  subscribeToCustomers,
  subscribeToJobs,
} = vi.hoisted(() => ({
  subscribeToBillingRecords: vi.fn(),
  subscribeToPaymentEntries: vi.fn(),
  recordManualPayment: vi.fn(),
  addPaymentEntry: vi.fn(),
  addBillingRecord: vi.fn(),
  autoGenerateBillingRecords: vi.fn(),
  subscribeToCustomers: vi.fn(),
  subscribeToJobs: vi.fn(),
}));

vi.mock('../services/billingService', () => ({
  billingService: {
    subscribeToBillingRecords,
    subscribeToPaymentEntries,
    recordManualPayment,
    addPaymentEntry,
    addBillingRecord,
    autoGenerateBillingRecords,
  },
}));

vi.mock('../services/customerService', () => ({
  customerService: {
    subscribeToCustomers,
  },
}));

vi.mock('../services/jobService', () => ({
  jobService: {
    subscribeToJobs,
  },
}));

describe('Billing quick payment flow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    subscribeToBillingRecords.mockReset();
    subscribeToPaymentEntries.mockReset();
    recordManualPayment.mockReset();
    addPaymentEntry.mockReset();
    addBillingRecord.mockReset();
    autoGenerateBillingRecords.mockReset();
    subscribeToCustomers.mockReset();
    subscribeToJobs.mockReset();

    subscribeToBillingRecords.mockImplementation((callback) => {
      callback([]);
      return () => {};
    });
    subscribeToPaymentEntries.mockImplementation((callback) => {
      callback([]);
      return () => {};
    });
    subscribeToCustomers.mockImplementation((callback) => {
      callback([{ id: 'customer-1', name: 'Acme Lawn' }]);
      return () => {};
    });
    subscribeToJobs.mockImplementation((callback) => {
      callback([]);
      return () => {};
    });
    autoGenerateBillingRecords.mockResolvedValue(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('clears saving state and shows an explicit error when manual payment save times out', async () => {
    recordManualPayment.mockImplementation(() => new Promise(() => {}));

    const { container } = render(
      <MemoryRouter>
        <Billing />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: /manual payment/i }));
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'customer-1' } });
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '75' } });
    fireEvent.click(screen.getByRole('button', { name: /^save payment$/i }));

    expect(screen.getByRole('button', { name: /saving/i })).toBeDisabled();
    expect(container.querySelector('.flex-1.overflow-y-auto')).toBeTruthy();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(25001);
      await Promise.resolve();
    });

    expect(screen.getByText('Manual payment save took too long and was stopped. Please try again.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^save payment$/i })).toBeEnabled();
  }, 15000);
});
