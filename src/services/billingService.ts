import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import { Job, jobService } from './jobService';
import { handleFirestoreError, OperationType } from './verificationService';

export type BillingStatus = 'draft' | 'scheduled' | 'due' | 'partial' | 'paid' | 'overdue' | 'canceled';
export type BillingType = 'one_time' | 'auto_bill';
export type PaymentMethod = 'cash' | 'check' | 'card' | 'bank_transfer' | 'other';

export interface BillingRecord {
  id?: string;
  ownerId: string;
  customerId: string;
  customer_name_snapshot: string;
  label: string;
  billing_type: BillingType;
  billing_frequency: string;
  status: BillingStatus;
  source: 'manual' | 'auto_generated';
  total_amount: number;
  amount_paid: number;
  balance_due: number;
  covered_job_ids: string[];
  covered_service_count: number;
  auto_bill_enabled: boolean;
  billing_period_key?: string;
  billing_period_start?: any;
  billing_period_end?: any;
  due_date?: any;
  paid_at?: any;
  notes?: string;
  created_at?: any;
  updated_at?: any;
}

export interface PaymentEntry {
  id?: string;
  ownerId: string;
  billing_record_id: string;
  customerId: string;
  customer_name_snapshot: string;
  amount: number;
  method: PaymentMethod;
  note?: string;
  received_at: any;
  created_at?: any;
}

const BILLING_COLLECTION = 'billing_records';
const PAYMENT_COLLECTION = 'payment_entries';

const toDate = (value: any) => {
  if (!value) return null;
  if (value instanceof Timestamp) return value.toDate();
  if (value?.toDate) return value.toDate();
  return new Date(value);
};

const startOfMonth = (value: Date) => new Date(value.getFullYear(), value.getMonth(), 1);
const endOfMonth = (value: Date) => new Date(value.getFullYear(), value.getMonth() + 1, 0, 23, 59, 59, 999);

const monthKey = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}`;

const getBillingStatus = (balanceDue: number, dueDate?: any): BillingStatus => {
  if (balanceDue <= 0) return 'paid';
  const parsedDueDate = toDate(dueDate);
  if (parsedDueDate && parsedDueDate.getTime() < Date.now()) return 'overdue';
  return 'due';
};

const isRecurringBillingFrequency = (frequency?: string) => {
  const normalized = (frequency || '').trim().toLowerCase();
  return ['weekly', 'bi-weekly', 'bi_weekly', 'monthly'].includes(normalized);
};

const waitForCurrentUser = async () => {
  if (auth.currentUser) return auth.currentUser;

  return new Promise<typeof auth.currentUser>((resolve) => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      unsubscribe();
      resolve(user);
    });
  });
};

const syncCoveredJobs = async (record: BillingRecord) => {
  const isPaid = record.balance_due <= 0;

  await Promise.all(
    (record.covered_job_ids || []).map((jobId) =>
      jobService.updateJob(jobId, {
        payment_status: isPaid ? 'paid' : 'unpaid',
      })
    )
  );
};

export const billingService = {
  subscribeToBillingRecords: (callback: (records: BillingRecord[]) => void) => {
    let unsubscribeRecords = () => {};

    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      unsubscribeRecords();

      if (!user) {
        callback([]);
        return;
      }

      unsubscribeRecords = onSnapshot(
        query(collection(db, BILLING_COLLECTION), where('ownerId', '==', user.uid)),
        (snapshot) => {
          callback(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() } as BillingRecord)));
        },
        (error) => handleFirestoreError(error, OperationType.GET, BILLING_COLLECTION)
      );
    });

    return () => {
      unsubscribeRecords();
      unsubscribeAuth();
    };
  },

  subscribeToPaymentEntries: (callback: (entries: PaymentEntry[]) => void) => {
    let unsubscribeEntries = () => {};

    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      unsubscribeEntries();

      if (!user) {
        callback([]);
        return;
      }

      unsubscribeEntries = onSnapshot(
        query(collection(db, PAYMENT_COLLECTION), where('ownerId', '==', user.uid)),
        (snapshot) => {
          callback(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() } as PaymentEntry)));
        },
        (error) => handleFirestoreError(error, OperationType.GET, PAYMENT_COLLECTION)
      );
    });

    return () => {
      unsubscribeEntries();
      unsubscribeAuth();
    };
  },

  addBillingRecord: async (
    record: Omit<BillingRecord, 'id' | 'ownerId' | 'created_at' | 'updated_at' | 'amount_paid' | 'balance_due' | 'status'>
  ) => {
    const user = await waitForCurrentUser();
    if (!user) throw new Error('User not authenticated');

    const totalAmount = Number(record.total_amount || 0);
    const dueDate = record.due_date || Timestamp.fromDate(new Date());
    const status = getBillingStatus(totalAmount, dueDate);

    try {
      const ref = await addDoc(collection(db, BILLING_COLLECTION), {
        ...record,
        ownerId: user.uid,
        amount_paid: 0,
        balance_due: totalAmount,
        status,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      });

      await syncCoveredJobs({
        ...record,
        id: ref.id,
        ownerId: user.uid,
        amount_paid: 0,
        balance_due: totalAmount,
        status,
      });

      return ref;
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, BILLING_COLLECTION);
    }
  },

  updateBillingRecord: async (id: string, updates: Partial<BillingRecord>) => {
    try {
      await updateDoc(doc(db, BILLING_COLLECTION, id), {
        ...updates,
        updated_at: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `${BILLING_COLLECTION}/${id}`);
    }
  },

  addPaymentEntry: async (
    record: Omit<PaymentEntry, 'id' | 'ownerId' | 'created_at'>,
    billingRecord: BillingRecord
  ) => {
    const user = await waitForCurrentUser();
    if (!user) throw new Error('User not authenticated');

    const nextAmountPaid = Number(billingRecord.amount_paid || 0) + Number(record.amount || 0);
    const nextBalanceDue = Math.max(0, Number(billingRecord.total_amount || 0) - nextAmountPaid);
    const nextStatus = nextBalanceDue <= 0
      ? 'paid'
      : nextAmountPaid > 0
      ? 'partial'
      : getBillingStatus(Number(billingRecord.total_amount || 0), billingRecord.due_date);

    try {
      await addDoc(collection(db, PAYMENT_COLLECTION), {
        ...record,
        ownerId: user.uid,
        created_at: serverTimestamp(),
      });

      const updates: Partial<BillingRecord> = {
        amount_paid: nextAmountPaid,
        balance_due: nextBalanceDue,
        status: nextStatus,
      };

      if (nextStatus === 'paid') {
        updates.paid_at = record.received_at;
      }

      await billingService.updateBillingRecord(billingRecord.id!, updates);
      await syncCoveredJobs({
        ...billingRecord,
        ...updates,
      } as BillingRecord);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, PAYMENT_COLLECTION);
    }
  },

  autoGenerateBillingRecords: async (jobs: Job[], existingRecords: BillingRecord[]) => {
    const user = await waitForCurrentUser();
    if (!user) return 0;

    const coveredJobIds = new Set(existingRecords.flatMap((record) => record.covered_job_ids || []));
    const existingPeriodKeys = new Set(
      existingRecords
        .filter((record) => record.billing_type === 'auto_bill' && record.billing_period_key)
        .map((record) => `${record.customerId}_${record.billing_period_key}`)
    );

    const groupedJobs = jobs.reduce<Record<string, Job[]>>((groups, job) => {
      if (!job.id || !job.customerId || !job.is_billable || job.payment_status === 'paid') return groups;
      if (job.status !== 'completed' || coveredJobIds.has(job.id)) return groups;

      const jobDate = toDate(job.completed_date || job.scheduled_date || job.created_at) || new Date();

      if (isRecurringBillingFrequency(job.billing_frequency) || job.is_recurring) {
        const key = `${job.customerId}_${monthKey(jobDate)}`;
        groups[key] = [...(groups[key] || []), job];
        return groups;
      }

      const key = `${job.customerId}_${job.id}`;
      groups[key] = [job];
      return groups;
    }, {});

    const groupsToCreate = Object.entries(groupedJobs).filter(([groupKey, grouped]) => {
      if (grouped.length > 1) {
        return !existingPeriodKeys.has(groupKey);
      }

      const onlyJob = grouped[0];
      return !!onlyJob?.id && !coveredJobIds.has(onlyJob.id);
    });

    if (groupsToCreate.length === 0) return 0;

    let createdCount = 0;

    for (const [groupKey, grouped] of groupsToCreate) {
      const firstJob = grouped[0];
      if (!firstJob?.customerId) continue;

      const anchorDate = toDate(firstJob.completed_date || firstJob.scheduled_date || firstJob.created_at) || new Date();
      const recurringGroup = grouped.length > 1;
      const periodStart = startOfMonth(anchorDate);
      const periodEnd = endOfMonth(anchorDate);
      const totalAmount = grouped.reduce((sum, job) => sum + Number(job.price_snapshot || 0), 0);

      await billingService.addBillingRecord({
        customerId: firstJob.customerId,
        customer_name_snapshot: firstJob.customer_name_snapshot,
        label: recurringGroup
          ? `Auto Bill - ${anchorDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`
          : `Billing - ${firstJob.service_snapshot}`,
        billing_type: recurringGroup ? 'auto_bill' : 'one_time',
        billing_frequency: recurringGroup ? 'monthly' : (firstJob.billing_frequency || 'one-time'),
        source: 'auto_generated',
        total_amount: totalAmount,
        covered_job_ids: grouped.map((job) => job.id!).filter(Boolean),
        covered_service_count: grouped.length,
        auto_bill_enabled: recurringGroup,
        billing_period_key: recurringGroup ? groupKey.split('_').slice(1).join('_') : firstJob.id,
        billing_period_start: Timestamp.fromDate(recurringGroup ? periodStart : anchorDate),
        billing_period_end: Timestamp.fromDate(recurringGroup ? periodEnd : anchorDate),
        due_date: Timestamp.fromDate(periodEnd),
        notes: '',
      });
      createdCount += 1;
    }

    return createdCount;
  },
};
