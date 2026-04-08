import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AlertCircle, CheckCircle, CreditCard, DollarSign, Plus, Receipt, Save, X } from 'lucide-react';
import { Timestamp } from 'firebase/firestore';
import { billingService, BillingRecord, PaymentEntry, PaymentMethod } from '../services/billingService';
import { customerService, Customer } from '../services/customerService';
import { jobService, Job } from '../services/jobService';

const formatCurrency = (amount: number) =>
  amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

const toDate = (value: any) => {
  if (!value) return null;
  if (value instanceof Timestamp) return value.toDate();
  if (value?.toDate) return value.toDate();
  return new Date(value);
};

export default function Billing() {
  const location = useLocation();
  const navigate = useNavigate();
  const [billingRecords, setBillingRecords] = useState<BillingRecord[]>([]);
  const [paymentEntries, setPaymentEntries] = useState<PaymentEntry[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [isAddingBilling, setIsAddingBilling] = useState(false);
  const [paymentTarget, setPaymentTarget] = useState<BillingRecord | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [lastAutoSyncKey, setLastAutoSyncKey] = useState('');
  const [hasBillingLoaded, setHasBillingLoaded] = useState(false);
  const [pendingQuickPayment, setPendingQuickPayment] = useState(false);
  const [isManualPayment, setIsManualPayment] = useState(false);

  const [customerId, setCustomerId] = useState('');
  const [billingType, setBillingType] = useState<'one_time' | 'auto_bill'>('one_time');
  const [billingFrequency, setBillingFrequency] = useState('one-time');
  const [billingLabel, setBillingLabel] = useState('');
  const [billingAmount, setBillingAmount] = useState('');
  const [billingDueDate, setBillingDueDate] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [billingNotes, setBillingNotes] = useState('');
  const [selectedJobIds, setSelectedJobIds] = useState<string[]>([]);

  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('card');
  const [paymentNote, setPaymentNote] = useState('');
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [manualPaymentCustomerId, setManualPaymentCustomerId] = useState('');
  const [manualPaymentLabel, setManualPaymentLabel] = useState('');

  useEffect(() => {
    const unsubscribeBilling = billingService.subscribeToBillingRecords((records) => {
      setBillingRecords(records);
      setHasBillingLoaded(true);
    });
    const unsubscribePayments = billingService.subscribeToPaymentEntries(setPaymentEntries);
    const unsubscribeCustomers = customerService.subscribeToCustomers(setCustomers);
    const unsubscribeJobs = jobService.subscribeToJobs(setJobs);

    return () => {
      unsubscribeBilling();
      unsubscribePayments();
      unsubscribeCustomers();
      unsubscribeJobs();
    };
  }, []);

  useEffect(() => {
    if (billingRecords.length === 0 && jobs.length === 0) return;

    const syncKey = [
      billingRecords.length,
      jobs
        .filter((job) => job.status === 'completed' && job.payment_status !== 'paid')
        .map((job) => `${job.id}:${job.payment_status}:${job.completed_date || job.scheduled_date || ''}`)
        .sort()
        .join('|'),
    ].join('::');
    if (syncKey === lastAutoSyncKey) return;

    const syncAutoBills = async () => {
      const createdCount = await billingService.autoGenerateBillingRecords(jobs, billingRecords);
      if (createdCount > 0) {
        setSuccessMessage(`${createdCount} Auto Bill draft${createdCount === 1 ? '' : 's'} created.`);
      }
      setLastAutoSyncKey(syncKey);
    };

    syncAutoBills();
  }, [billingRecords, jobs, lastAutoSyncKey]);

  useEffect(() => {
    if (location.state?.openAddBilling) {
      setIsAddingBilling(true);
      navigate(location.pathname, { replace: true });
    }

    if (location.state?.openPaymentModal) {
      setPendingQuickPayment(true);
      navigate(location.pathname, { replace: true });
    }
  }, [location.pathname, location.state, navigate]);

  useEffect(() => {
    if (!pendingQuickPayment || !hasBillingLoaded) return;

    const firstOpenBilling = billingRecords.find((record) => ['due', 'partial', 'overdue'].includes(record.status));
    if (firstOpenBilling) {
      setIsManualPayment(false);
      setPaymentTarget(firstOpenBilling);
      setPaymentAmount(String(firstOpenBilling.balance_due || firstOpenBilling.total_amount || 0));
    } else {
      setPaymentTarget(null);
      setIsManualPayment(true);
    }
    setPendingQuickPayment(false);
  }, [pendingQuickPayment, hasBillingLoaded, billingRecords]);

  useEffect(() => {
    if (!successMessage) return undefined;
    const timeout = window.setTimeout(() => setSuccessMessage(null), 3000);
    return () => window.clearTimeout(timeout);
  }, [successMessage]);

  const openBillingRecords = useMemo(
    () => billingRecords.filter((record) => ['due', 'partial', 'overdue'].includes(record.status)),
    [billingRecords]
  );

  const overdueBillingRecords = useMemo(
    () => billingRecords.filter((record) => record.status === 'overdue'),
    [billingRecords]
  );

  const outstandingAmount = useMemo(
    () => openBillingRecords.reduce((sum, record) => sum + Number(record.balance_due || 0), 0),
    [openBillingRecords]
  );

  const collectedAmount = useMemo(
    () => paymentEntries.reduce((sum, entry) => sum + Number(entry.amount || 0), 0),
    [paymentEntries]
  );

  const availableJobsForCustomer = useMemo(() => {
    if (!customerId) return [];

    const coveredJobIds = new Set(billingRecords.flatMap((record) => record.covered_job_ids || []));

    return jobs.filter((job) =>
      job.customerId === customerId &&
      job.status === 'completed' &&
      job.is_billable &&
      job.payment_status !== 'paid' &&
      !!job.id &&
      !coveredJobIds.has(job.id)
    );
  }, [customerId, jobs, billingRecords]);

  useEffect(() => {
    if (selectedJobIds.length === 0) return;

    const selectedJobs = availableJobsForCustomer.filter((job) => selectedJobIds.includes(job.id || ''));
    const nextAmount = selectedJobs.reduce((sum, job) => sum + Number(job.price_snapshot || 0), 0);
    setBillingAmount(nextAmount ? String(nextAmount) : '');
  }, [selectedJobIds, availableJobsForCustomer]);

  const resetBillingForm = () => {
    setCustomerId('');
    setBillingType('one_time');
    setBillingFrequency('one-time');
    setBillingLabel('');
    setBillingAmount('');
    setBillingDueDate('');
    setPeriodStart('');
    setPeriodEnd('');
    setBillingNotes('');
    setSelectedJobIds([]);
  };

  const resetPaymentForm = () => {
    setPaymentTarget(null);
    setIsManualPayment(false);
    setPaymentAmount('');
    setPaymentMethod('card');
    setPaymentNote('');
    setPaymentDate(new Date().toISOString().slice(0, 10));
    setManualPaymentCustomerId('');
    setManualPaymentLabel('');
  };

  const handleCreateBilling = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMessage(null);

    const customer = customers.find((entry) => entry.id === customerId);
    if (!customer) {
      setErrorMessage('Choose a customer before saving billing.');
      return;
    }

    const coveredJobs = availableJobsForCustomer.filter((job) => selectedJobIds.includes(job.id || ''));
    const totalAmount = Number(billingAmount || 0);
    if (totalAmount <= 0) {
      setErrorMessage('Billing amount must be greater than zero.');
      return;
    }

    try {
      await billingService.addBillingRecord({
        customerId: customer.id || '',
        customer_name_snapshot: customer.name,
        label: billingLabel.trim() || `${billingType === 'auto_bill' ? 'Auto Bill' : 'Billing'} - ${customer.name}`,
        billing_type: billingType,
        billing_frequency: billingFrequency,
        source: 'manual',
        total_amount: totalAmount,
        covered_job_ids: coveredJobs.map((job) => job.id!).filter(Boolean),
        covered_service_count: coveredJobs.length,
        auto_bill_enabled: billingType === 'auto_bill',
        billing_period_key: billingType === 'auto_bill' && periodStart ? periodStart.slice(0, 7) : undefined,
        billing_period_start: periodStart ? Timestamp.fromDate(new Date(periodStart)) : null,
        billing_period_end: periodEnd ? Timestamp.fromDate(new Date(periodEnd)) : null,
        due_date: billingDueDate ? Timestamp.fromDate(new Date(billingDueDate)) : Timestamp.fromDate(new Date()),
        notes: billingNotes.trim(),
      });

      resetBillingForm();
      setIsAddingBilling(false);
      setSuccessMessage('Billing saved');
    } catch (error) {
      console.error('Error saving billing:', error);
      setErrorMessage('Failed to save billing.');
    }
  };

  const handleRecordPayment = async (event: React.FormEvent) => {
    event.preventDefault();

    const amount = Number(paymentAmount || 0);
    if (amount <= 0) {
      setErrorMessage('Payment amount must be greater than zero.');
      return;
    }

    try {
      if (isManualPayment) {
        const customer = customers.find((entry) => entry.id === manualPaymentCustomerId);
        if (!customer?.id) {
          setErrorMessage('Choose a customer before saving a manual payment.');
          return;
        }

        await billingService.recordManualPayment({
          customerId: customer.id,
          customer_name_snapshot: customer.name,
          amount,
          method: paymentMethod,
          note: paymentNote.trim(),
          received_at: Timestamp.fromDate(new Date(paymentDate)),
          label: manualPaymentLabel.trim(),
        });
      } else {
        if (!paymentTarget?.id) return;

        await billingService.addPaymentEntry(
          {
            billing_record_id: paymentTarget.id,
            customerId: paymentTarget.customerId,
            customer_name_snapshot: paymentTarget.customer_name_snapshot,
            amount,
            method: paymentMethod,
            note: paymentNote.trim(),
            received_at: Timestamp.fromDate(new Date(paymentDate)),
          },
          paymentTarget
        );
      }

      resetPaymentForm();
      setSuccessMessage('Payment recorded');
    } catch (error) {
      console.error('Error recording payment:', error);
      setErrorMessage('Failed to record payment.');
    }
  };

  const sortedBillingRecords = [...billingRecords].sort((left, right) => {
    const leftDate = toDate(left.due_date || left.created_at)?.getTime() || 0;
    const rightDate = toDate(right.due_date || right.created_at)?.getTime() || 0;
    return rightDate - leftDate;
  });

  return (
    <div className="space-y-8 pb-24">
      <header className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-black text-gray-900 tracking-tight">Billing</h2>
          <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">Auto Bill and payment tracking</p>
        </div>
        <button
          onClick={() => setIsAddingBilling(true)}
          className="px-5 py-3 bg-blue-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-blue-700 transition-all flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          New Billing
        </button>
      </header>

      {errorMessage && (
        <div className="rounded-2xl border border-red-100 bg-red-50 px-5 py-4 flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-red-600 shrink-0" />
          <p className="text-sm font-bold text-red-700">{errorMessage}</p>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-blue-600 rounded-3xl p-6 text-white shadow-xl shadow-blue-100">
          <Receipt className="h-6 w-6 mb-4 text-blue-100" />
          <p className="text-3xl font-black">{openBillingRecords.length}</p>
          <p className="text-[10px] font-bold uppercase tracking-widest text-blue-100">Open Billing</p>
        </div>
        <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
          <AlertCircle className="h-6 w-6 mb-4 text-red-500" />
          <p className="text-3xl font-black text-gray-900">{overdueBillingRecords.length}</p>
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Overdue</p>
        </div>
        <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
          <DollarSign className="h-6 w-6 mb-4 text-blue-600" />
          <p className="text-3xl font-black text-gray-900">{formatCurrency(outstandingAmount)}</p>
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Outstanding</p>
        </div>
        <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
          <CheckCircle className="h-6 w-6 mb-4 text-green-600" />
          <p className="text-3xl font-black text-gray-900">{formatCurrency(collectedAmount)}</p>
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Collected</p>
        </div>
      </div>

      <section className="bg-white rounded-[40px] border border-gray-100 shadow-sm p-6">
        <div className="flex items-center justify-between gap-4 mb-6">
          <div>
            <h3 className="text-lg font-black text-gray-900">Billing Records</h3>
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mt-2">
              Payments stay separate from job completion and can cover multiple service visits
            </p>
          </div>
          <button
            onClick={() => {
              setErrorMessage(null);
              setIsManualPayment(true);
              setPaymentTarget(null);
            }}
            className="px-4 py-3 rounded-2xl bg-gray-100 text-gray-700 text-xs font-black uppercase tracking-widest hover:bg-gray-200 transition-all flex items-center gap-2"
          >
            <CreditCard className="h-4 w-4" />
            Manual Payment
          </button>
        </div>

        <div className="space-y-4">
          {sortedBillingRecords.length === 0 ? (
            <div className="rounded-3xl border-2 border-dashed border-gray-200 bg-gray-50 p-12 text-center">
              <p className="text-sm font-black text-gray-900">No billing records yet</p>
              <p className="text-xs font-bold text-gray-500 mt-2">
                Completed unpaid work will auto-generate Auto Bill drafts when applicable.
              </p>
            </div>
          ) : (
            sortedBillingRecords.map((record) => (
              <div key={record.id} className="rounded-3xl border border-gray-100 bg-gray-50 p-5">
                <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-black text-gray-900">{record.customer_name_snapshot}</p>
                      <span className={`text-[10px] font-black px-2 py-1 rounded-full uppercase tracking-widest ${
                        record.status === 'paid'
                          ? 'bg-green-100 text-green-700'
                          : record.status === 'overdue'
                          ? 'bg-red-100 text-red-700'
                          : record.status === 'partial'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-blue-100 text-blue-700'
                      }`}>
                        {record.status}
                      </span>
                      <span className="text-[10px] font-black px-2 py-1 rounded-full uppercase tracking-widest bg-white text-gray-500 border border-gray-200">
                        {record.billing_type === 'auto_bill' ? 'Auto Bill' : 'One-time'}
                      </span>
                    </div>
                    <p className="text-xs font-bold text-gray-500 mt-2">{record.label}</p>
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mt-3">
                      {record.covered_service_count} visit{record.covered_service_count === 1 ? '' : 's'} covered
                      {record.billing_period_start && record.billing_period_end
                        ? ` • ${toDate(record.billing_period_start)?.toLocaleDateString()} to ${toDate(record.billing_period_end)?.toLocaleDateString()}`
                        : ''}
                    </p>
                  </div>

                  <div className="flex flex-col xl:items-end gap-3">
                    <div className="text-left xl:text-right">
                      <p className="text-sm font-black text-gray-900">{formatCurrency(record.total_amount || 0)}</p>
                      <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mt-2">
                        Balance {formatCurrency(record.balance_due || 0)}
                      </p>
                    </div>
                    {record.status !== 'paid' && (
                      <button
                        onClick={() => {
                          setIsManualPayment(false);
                          setPaymentTarget(record);
                          setPaymentAmount(String(record.balance_due || record.total_amount || 0));
                        }}
                        className="px-4 py-3 rounded-2xl bg-blue-600 text-white text-xs font-black uppercase tracking-widest hover:bg-blue-700 transition-all flex items-center gap-2"
                      >
                        <CreditCard className="h-4 w-4" />
                        Record Payment
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="bg-white rounded-[40px] border border-gray-100 shadow-sm p-6">
        <h3 className="text-lg font-black text-gray-900 mb-6">Recent Payments</h3>
        <div className="space-y-3">
          {paymentEntries.length === 0 ? (
            <p className="text-sm font-bold text-gray-400">No payments recorded yet.</p>
          ) : (
            [...paymentEntries]
              .sort((left, right) => (toDate(right.received_at)?.getTime() || 0) - (toDate(left.received_at)?.getTime() || 0))
              .slice(0, 8)
              .map((entry) => (
                <div key={entry.id} className="rounded-2xl bg-gray-50 border border-gray-100 px-4 py-3 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-black text-gray-900">{entry.customer_name_snapshot}</p>
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mt-2">
                      {entry.method.replace('_', ' ')} • {toDate(entry.received_at)?.toLocaleDateString()}
                    </p>
                  </div>
                  <p className="text-sm font-black text-blue-600">{formatCurrency(entry.amount || 0)}</p>
                </div>
              ))
          )}
        </div>
      </section>

      {isAddingBilling && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-4">
          <div className="bg-white rounded-[32px] w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between px-8 py-6 border-b border-gray-100 sticky top-0 bg-white z-10">
              <div>
                <h3 className="text-xl font-black text-gray-900">New Billing</h3>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-2">Manual billing and Auto Bill setup</p>
              </div>
              <button onClick={() => { setIsAddingBilling(false); resetBillingForm(); }} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>

            <form onSubmit={handleCreateBilling} className="p-8 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="block">
                  <span className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Customer</span>
                  <select
                    required
                    value={customerId}
                    onChange={(event) => {
                      setCustomerId(event.target.value);
                      setSelectedJobIds([]);
                    }}
                    className="w-full px-5 py-4 bg-gray-50 rounded-2xl border-none text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="">Choose customer</option>
                    {customers.map((customer) => (
                      <option key={customer.id} value={customer.id}>{customer.name}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Billing Type</span>
                  <select
                    value={billingType}
                    onChange={(event) => setBillingType(event.target.value as 'one_time' | 'auto_bill')}
                    className="w-full px-5 py-4 bg-gray-50 rounded-2xl border-none text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="one_time">One-time Billing</option>
                    <option value="auto_bill">Auto Bill</option>
                  </select>
                </label>
                <label className="block">
                  <span className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Frequency</span>
                  <select
                    value={billingFrequency}
                    onChange={(event) => setBillingFrequency(event.target.value)}
                    className="w-full px-5 py-4 bg-gray-50 rounded-2xl border-none text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="one-time">One-time</option>
                    <option value="weekly">Weekly</option>
                    <option value="bi-weekly">Bi-weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="flexible">Flexible</option>
                  </select>
                </label>
                <label className="block">
                  <span className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Amount</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={billingAmount}
                    onChange={(event) => setBillingAmount(event.target.value)}
                    className="w-full px-5 py-4 bg-gray-50 rounded-2xl border-none text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="0.00"
                  />
                </label>
                <label className="block md:col-span-2">
                  <span className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Label</span>
                  <input
                    type="text"
                    value={billingLabel}
                    onChange={(event) => setBillingLabel(event.target.value)}
                    className="w-full px-5 py-4 bg-gray-50 rounded-2xl border-none text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="Monthly lawn billing"
                  />
                </label>
                <label className="block">
                  <span className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Due Date</span>
                  <input
                    type="date"
                    value={billingDueDate}
                    onChange={(event) => setBillingDueDate(event.target.value)}
                    className="w-full px-5 py-4 bg-gray-50 rounded-2xl border-none text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </label>
                <label className="block">
                  <span className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Period Start</span>
                  <input
                    type="date"
                    value={periodStart}
                    onChange={(event) => setPeriodStart(event.target.value)}
                    className="w-full px-5 py-4 bg-gray-50 rounded-2xl border-none text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </label>
                <label className="block">
                  <span className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Period End</span>
                  <input
                    type="date"
                    value={periodEnd}
                    onChange={(event) => setPeriodEnd(event.target.value)}
                    className="w-full px-5 py-4 bg-gray-50 rounded-2xl border-none text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </label>
                <label className="block md:col-span-2">
                  <span className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Notes</span>
                  <textarea
                    value={billingNotes}
                    onChange={(event) => setBillingNotes(event.target.value)}
                    className="w-full px-5 py-4 bg-gray-50 rounded-2xl border-none text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none min-h-[100px]"
                    placeholder="Optional billing notes"
                  />
                </label>
              </div>

              {customerId && (
                <div className="rounded-3xl border border-gray-100 bg-gray-50 p-5">
                  <div className="flex items-center justify-between gap-4 mb-4">
                    <div>
                      <p className="text-sm font-black text-gray-900">Covered Visits</p>
                      <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mt-2">
                        Select completed unpaid service visits to cover with this billing record
                      </p>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {availableJobsForCustomer.length === 0 ? (
                      <p className="text-sm font-bold text-gray-400">No completed unpaid jobs are available for this customer.</p>
                    ) : (
                      availableJobsForCustomer.map((job) => (
                        <label key={job.id} className="flex items-center justify-between gap-4 rounded-2xl bg-white border border-gray-100 px-4 py-3">
                          <div>
                            <p className="text-sm font-black text-gray-900">{job.service_snapshot}</p>
                            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mt-2">
                              {toDate(job.completed_date || job.scheduled_date)?.toLocaleDateString()} • {formatCurrency(job.price_snapshot || 0)}
                            </p>
                          </div>
                          <input
                            type="checkbox"
                            checked={selectedJobIds.includes(job.id || '')}
                            onChange={(event) => setSelectedJobIds((prev) => (
                              event.target.checked
                                ? [...prev, job.id || '']
                                : prev.filter((entry) => entry !== job.id)
                            ))}
                            className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                        </label>
                      ))
                    )}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => { setIsAddingBilling(false); resetBillingForm(); }}
                  className="px-5 py-3 rounded-2xl bg-gray-100 text-gray-600 text-xs font-black uppercase tracking-widest hover:bg-gray-200 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-3 rounded-2xl bg-blue-600 text-white text-xs font-black uppercase tracking-widest hover:bg-blue-700 transition-all flex items-center gap-2"
                >
                  <Save className="h-4 w-4" />
                  Save Billing
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {(paymentTarget || isManualPayment) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-4">
          <div className="bg-white rounded-[32px] w-full max-w-xl shadow-2xl">
            <div className="flex items-center justify-between px-8 py-6 border-b border-gray-100">
              <div>
                <h3 className="text-xl font-black text-gray-900">Record Payment</h3>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-2">
                  {isManualPayment ? 'Manual payment entry' : paymentTarget?.customer_name_snapshot}
                </p>
              </div>
              <button onClick={resetPaymentForm} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>

            <form onSubmit={handleRecordPayment} className="p-8 space-y-6">
              {isManualPayment ? (
                <div className="rounded-3xl bg-blue-50 border border-blue-100 px-5 py-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-blue-600">Manual Payment</p>
                  <p className="text-sm font-black text-gray-900 mt-2">
                    Record a payment even when there is no open billing record yet. ServTrax will track it inside Billing.
                  </p>
                </div>
              ) : (
                <div className="rounded-3xl bg-gray-50 border border-gray-100 px-5 py-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Balance Due</p>
                  <p className="text-lg font-black text-gray-900 mt-2">{formatCurrency(paymentTarget?.balance_due || 0)}</p>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {isManualPayment && (
                  <>
                    <label className="block md:col-span-2">
                      <span className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Customer</span>
                      <select
                        required
                        value={manualPaymentCustomerId}
                        onChange={(event) => setManualPaymentCustomerId(event.target.value)}
                        className="w-full px-5 py-4 bg-gray-50 rounded-2xl border-none text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                      >
                        <option value="">Choose customer</option>
                        {customers.map((customer) => (
                          <option key={customer.id} value={customer.id}>{customer.name}</option>
                        ))}
                      </select>
                    </label>
                    <label className="block md:col-span-2">
                      <span className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Label</span>
                      <input
                        type="text"
                        value={manualPaymentLabel}
                        onChange={(event) => setManualPaymentLabel(event.target.value)}
                        className="w-full px-5 py-4 bg-gray-50 rounded-2xl border-none text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                        placeholder="Early payment, prepayment, deposit..."
                      />
                    </label>
                  </>
                )}
                <label className="block">
                  <span className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Amount</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={paymentAmount}
                    onChange={(event) => setPaymentAmount(event.target.value)}
                    className="w-full px-5 py-4 bg-gray-50 rounded-2xl border-none text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </label>
                <label className="block">
                  <span className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Method</span>
                  <select
                    value={paymentMethod}
                    onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod)}
                    className="w-full px-5 py-4 bg-gray-50 rounded-2xl border-none text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="card">Card</option>
                    <option value="cash">Cash</option>
                    <option value="check">Check</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="other">Other</option>
                  </select>
                </label>
                <label className="block">
                  <span className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Received Date</span>
                  <input
                    type="date"
                    value={paymentDate}
                    onChange={(event) => setPaymentDate(event.target.value)}
                    className="w-full px-5 py-4 bg-gray-50 rounded-2xl border-none text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </label>
                <label className="block">
                  <span className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Note</span>
                  <input
                    type="text"
                    value={paymentNote}
                    onChange={(event) => setPaymentNote(event.target.value)}
                    className="w-full px-5 py-4 bg-gray-50 rounded-2xl border-none text-sm font-bold text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="Optional"
                  />
                </label>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={resetPaymentForm}
                  className="px-5 py-3 rounded-2xl bg-gray-100 text-gray-600 text-xs font-black uppercase tracking-widest hover:bg-gray-200 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-3 rounded-2xl bg-blue-600 text-white text-xs font-black uppercase tracking-widest hover:bg-blue-700 transition-all flex items-center gap-2"
                >
                  <Save className="h-4 w-4" />
                  Save Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {successMessage && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[120] w-full max-w-md px-4">
          <div className="rounded-2xl shadow-2xl px-5 py-4 bg-green-600 text-white flex items-center gap-3">
            <CheckCircle className="h-5 w-5 shrink-0" />
            <p className="text-sm font-bold">{successMessage}</p>
          </div>
        </div>
      )}
    </div>
  );
}
