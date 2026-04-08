import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  getDoc,
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
import { localFallbackStore } from './localFallbackStore';
import { waitForCurrentUser } from './authSessionService';
import { SaveDebugContext, savePipelineService } from './savePipelineService';

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
  storage_source?: 'primary' | 'fallback_user_doc' | 'local_storage';
  source_billing_record_id?: string;
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
  storage_source?: 'primary' | 'fallback_user_doc' | 'local_storage';
  source_billing_record_id?: string;
}

export interface ManualPaymentInput {
  customerId: string;
  customer_name_snapshot: string;
  amount: number;
  method: PaymentMethod;
  note?: string;
  received_at: any;
  label?: string;
}

const BILLING_COLLECTION = 'billing_records';
const PAYMENT_COLLECTION = 'payment_entries';
const FALLBACK_BILLING_FIELD = 'billing_record_fallbacks';
const FALLBACK_PAYMENT_FIELD = 'payment_entry_fallbacks';
const LOCAL_BILLING_NAMESPACE = 'billing_records';
const LOCAL_PAYMENT_NAMESPACE = 'payment_entries';

const toDate = (value: any) => {
  if (!value) return null;
  if (value instanceof Timestamp) return value.toDate();
  if (value?.toDate) return value.toDate();
  return new Date(value);
};

const startOfMonth = (value: Date) => new Date(value.getFullYear(), value.getMonth(), 1);
const endOfMonth = (value: Date) => new Date(value.getFullYear(), value.getMonth() + 1, 0, 23, 59, 59, 999);

const monthKey = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}`;
const createFallbackId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const createClientTimestamp = () => new Date().toISOString();
const serializeDateValue = (value: any) => {
  if (!value) return value ?? null;
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value?.toDate) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return value;
};
const normalizeFallbackBillingRecord = (ownerId: string, raw: any): BillingRecord => ({
  id: `fallback:${ownerId}:${raw.fallback_id || raw.source_billing_record_id || raw.created_at || ''}`,
  ownerId,
  customerId: raw.customerId || '',
  customer_name_snapshot: raw.customer_name_snapshot || '',
  label: raw.label || '',
  billing_type: raw.billing_type || 'one_time',
  billing_frequency: raw.billing_frequency || '',
  status: raw.status || 'due',
  source: raw.source || 'manual',
  total_amount: Number(raw.total_amount || 0),
  amount_paid: Number(raw.amount_paid || 0),
  balance_due: Number(raw.balance_due || 0),
  covered_job_ids: Array.isArray(raw.covered_job_ids) ? raw.covered_job_ids : [],
  covered_service_count: Number(raw.covered_service_count || 0),
  auto_bill_enabled: !!raw.auto_bill_enabled,
  billing_period_key: raw.billing_period_key || '',
  billing_period_start: raw.billing_period_start || null,
  billing_period_end: raw.billing_period_end || null,
  due_date: raw.due_date || null,
  paid_at: raw.paid_at || null,
  notes: raw.notes || '',
  created_at: raw.created_at,
  updated_at: raw.updated_at,
  storage_source: 'fallback_user_doc',
  source_billing_record_id: raw.source_billing_record_id || '',
});
const normalizeFallbackPaymentEntry = (ownerId: string, raw: any): PaymentEntry => ({
  id: `fallback:${ownerId}:${raw.fallback_id || raw.created_at || ''}`,
  ownerId,
  billing_record_id: raw.billing_record_id || raw.source_billing_record_id || '',
  customerId: raw.customerId || '',
  customer_name_snapshot: raw.customer_name_snapshot || '',
  amount: Number(raw.amount || 0),
  method: raw.method || 'other',
  note: raw.note || '',
  received_at: raw.received_at || raw.created_at || null,
  created_at: raw.created_at,
  storage_source: 'fallback_user_doc',
  source_billing_record_id: raw.source_billing_record_id || '',
});
const normalizeLocalBillingRecord = (ownerId: string, raw: any): BillingRecord => ({
  id: raw.id,
  ownerId,
  customerId: raw.customerId || '',
  customer_name_snapshot: raw.customer_name_snapshot || '',
  label: raw.label || '',
  billing_type: raw.billing_type || 'one_time',
  billing_frequency: raw.billing_frequency || '',
  status: raw.status || 'due',
  source: raw.source || 'manual',
  total_amount: Number(raw.total_amount || 0),
  amount_paid: Number(raw.amount_paid || 0),
  balance_due: Number(raw.balance_due || 0),
  covered_job_ids: Array.isArray(raw.covered_job_ids) ? raw.covered_job_ids : [],
  covered_service_count: Number(raw.covered_service_count || 0),
  auto_bill_enabled: !!raw.auto_bill_enabled,
  billing_period_key: raw.billing_period_key || '',
  billing_period_start: raw.billing_period_start || null,
  billing_period_end: raw.billing_period_end || null,
  due_date: raw.due_date || null,
  paid_at: raw.paid_at || null,
  notes: raw.notes || '',
  created_at: raw.created_at,
  updated_at: raw.updated_at,
  storage_source: 'local_storage',
  source_billing_record_id: raw.source_billing_record_id || '',
});
const normalizeLocalPaymentEntry = (ownerId: string, raw: any): PaymentEntry => ({
  id: raw.id,
  ownerId,
  billing_record_id: raw.billing_record_id || raw.source_billing_record_id || '',
  customerId: raw.customerId || '',
  customer_name_snapshot: raw.customer_name_snapshot || '',
  amount: Number(raw.amount || 0),
  method: raw.method || 'other',
  note: raw.note || '',
  received_at: raw.received_at || raw.created_at || null,
  created_at: raw.created_at,
  storage_source: 'local_storage',
  source_billing_record_id: raw.source_billing_record_id || '',
});
const extractFallbackBillingRecords = (ownerId: string, data: any): BillingRecord[] =>
  (Array.isArray(data?.[FALLBACK_BILLING_FIELD]) ? data[FALLBACK_BILLING_FIELD] : []).map((entry: any) =>
    normalizeFallbackBillingRecord(ownerId, entry)
  );
const extractFallbackPaymentEntries = (ownerId: string, data: any): PaymentEntry[] =>
  (Array.isArray(data?.[FALLBACK_PAYMENT_FIELD]) ? data[FALLBACK_PAYMENT_FIELD] : []).map((entry: any) =>
    normalizeFallbackPaymentEntry(ownerId, entry)
  );
const dedupeBillingRecords = (records: BillingRecord[]) => {
  const next = new Map<string, BillingRecord>();
  records.forEach((record) => {
    const key = record.id?.startsWith('fallback:')
      ? record.source_billing_record_id || record.id
      : record.id || `${record.customerId}:${record.label}:${record.created_at || ''}`;
    if (!next.has(key) || record.storage_source === 'fallback_user_doc') {
      next.set(key, record);
    }
  });
  return Array.from(next.values());
};
const dedupePaymentEntries = (entries: PaymentEntry[]) => {
  const next = new Map<string, PaymentEntry>();
  entries.forEach((entry) => {
    const key = entry.source_billing_record_id
      ? `${entry.source_billing_record_id}:${entry.amount}:${entry.received_at || entry.created_at || ''}`
      : entry.id || `${entry.customerId}:${entry.amount}:${entry.created_at || entry.received_at || ''}`;
    if (!next.has(key)) next.set(key, entry);
  });
  return Array.from(next.values());
};

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
    let unsubscribeFallbacks = () => {};
    let unsubscribeLocal = () => {};
    let primaryRecords: BillingRecord[] = [];
    let fallbackRecords: BillingRecord[] = [];
    let localRecords: BillingRecord[] = [];

    const emit = () => callback(dedupeBillingRecords([...localRecords, ...fallbackRecords, ...primaryRecords]));

    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      unsubscribeRecords();
      unsubscribeFallbacks();
      unsubscribeLocal();
      primaryRecords = [];
      fallbackRecords = [];
      localRecords = [];

      if (!user) {
        callback([]);
        return;
      }

      unsubscribeRecords = onSnapshot(
        query(collection(db, BILLING_COLLECTION), where('ownerId', '==', user.uid)),
        (snapshot) => {
          primaryRecords = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data(), storage_source: 'primary' } as BillingRecord));
          emit();
        },
        (error) => {
          console.error('Primary billing subscription failed, using fallback only:', error);
          primaryRecords = [];
          emit();
        }
      );

      unsubscribeFallbacks = onSnapshot(
        doc(db, 'users', user.uid),
        (snapshot) => {
          fallbackRecords = snapshot.exists() ? extractFallbackBillingRecords(user.uid, snapshot.data()) : [];
          emit();
        },
        (error) => {
          console.error('Fallback billing subscription failed:', error);
        }
      );

      unsubscribeLocal = localFallbackStore.subscribeToRecords<any>(LOCAL_BILLING_NAMESPACE, user.uid, (records) => {
        localRecords = records.map((entry) => normalizeLocalBillingRecord(user.uid, entry));
        emit();
      });
    });

    return () => {
      unsubscribeRecords();
      unsubscribeFallbacks();
      unsubscribeLocal();
      unsubscribeAuth();
    };
  },

  subscribeToPaymentEntries: (callback: (entries: PaymentEntry[]) => void) => {
    let unsubscribeEntries = () => {};
    let unsubscribeFallbacks = () => {};
    let unsubscribeLocal = () => {};
    let primaryEntries: PaymentEntry[] = [];
    let fallbackEntries: PaymentEntry[] = [];
    let localEntries: PaymentEntry[] = [];

    const emit = () => callback(dedupePaymentEntries([...localEntries, ...fallbackEntries, ...primaryEntries]));

    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      unsubscribeEntries();
      unsubscribeFallbacks();
      unsubscribeLocal();
      primaryEntries = [];
      fallbackEntries = [];
      localEntries = [];

      if (!user) {
        callback([]);
        return;
      }

      unsubscribeEntries = onSnapshot(
        query(collection(db, PAYMENT_COLLECTION), where('ownerId', '==', user.uid)),
        (snapshot) => {
          primaryEntries = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data(), storage_source: 'primary' } as PaymentEntry));
          emit();
        },
        (error) => {
          console.error('Primary payment subscription failed, using fallback only:', error);
          primaryEntries = [];
          emit();
        }
      );

      unsubscribeFallbacks = onSnapshot(
        doc(db, 'users', user.uid),
        (snapshot) => {
          fallbackEntries = snapshot.exists() ? extractFallbackPaymentEntries(user.uid, snapshot.data()) : [];
          emit();
        },
        (error) => {
          console.error('Fallback payment subscription failed:', error);
        }
      );

      unsubscribeLocal = localFallbackStore.subscribeToRecords<any>(LOCAL_PAYMENT_NAMESPACE, user.uid, (records) => {
        localEntries = records.map((entry) => normalizeLocalPaymentEntry(user.uid, entry));
        emit();
      });
    });

    return () => {
      unsubscribeEntries();
      unsubscribeFallbacks();
      unsubscribeLocal();
      unsubscribeAuth();
    };
  },

  addBillingRecord: async (
    record: Omit<BillingRecord, 'id' | 'ownerId' | 'created_at' | 'updated_at' | 'amount_paid' | 'balance_due' | 'status'>,
    debugContext?: SaveDebugContext
  ) => {
    if (debugContext) {
      savePipelineService.log(debugContext, 'service_called', 'billingService.addBillingRecord');
    }
    const user = await waitForCurrentUser({ debugContext });
    if (!user) throw new Error('User not authenticated');

    const totalAmount = Number(record.total_amount || 0);
    const dueDate = record.due_date || Timestamp.fromDate(new Date());
    const status = getBillingStatus(totalAmount, dueDate);
    if (debugContext) {
      savePipelineService.log(debugContext, 'payload_built', {
        customerId: record.customerId,
        totalAmount,
        status,
      });
    }

    try {
      if (debugContext) {
        savePipelineService.log(debugContext, 'db_write_attempted', BILLING_COLLECTION);
      }
      const ref = await savePipelineService.withTimeout(
        addDoc(collection(db, BILLING_COLLECTION), {
          ...record,
          ownerId: user.uid,
          amount_paid: 0,
          balance_due: totalAmount,
          status,
          created_at: serverTimestamp(),
          updated_at: serverTimestamp(),
        }),
        {
          timeoutMessage: 'Billing save timed out while writing to the database.',
          debugContext,
        }
      );
      if (debugContext) {
        savePipelineService.log(debugContext, 'db_write_succeeded', ref.id);
      }

      try {
        await syncCoveredJobs({
          ...record,
          id: ref.id,
          ownerId: user.uid,
          amount_paid: 0,
          balance_due: totalAmount,
          status,
        });
      } catch (syncError) {
        console.error('Covered job sync failed after billing save:', syncError);
      }

      return ref;
    } catch (error) {
      if (debugContext) {
        savePipelineService.logError(debugContext, 'db_write_failed', error);
        savePipelineService.log(debugContext, 'fallback_write_attempted', 'users/{uid}.billing_record_fallbacks');
      }
      console.error('Primary billing save failed, using fallback storage:', error);
      const fallbackId = createFallbackId('billing');
      const timestamp = createClientTimestamp();
      const fallbackRecord = {
        fallback_id: fallbackId,
        ...record,
        due_date: serializeDateValue(dueDate),
        billing_period_start: serializeDateValue(record.billing_period_start),
        billing_period_end: serializeDateValue(record.billing_period_end),
        ownerId: user.uid,
        amount_paid: 0,
        balance_due: totalAmount,
        status,
        created_at: timestamp,
        updated_at: timestamp,
      };

      try {
        await savePipelineService.withTimeout(
          updateDoc(doc(db, 'users', user.uid), {
            [FALLBACK_BILLING_FIELD]: arrayUnion(fallbackRecord),
            updated_at: serverTimestamp(),
          }),
          {
            timeoutMessage: 'Billing fallback save timed out while writing to the user document.',
            debugContext,
          }
        );
        if (debugContext) {
          savePipelineService.log(debugContext, 'fallback_write_succeeded', `fallback:${user.uid}:${fallbackId}`);
        }

        try {
          await syncCoveredJobs({
            ...record,
            id: `fallback:${user.uid}:${fallbackId}`,
            ownerId: user.uid,
            amount_paid: 0,
            balance_due: totalAmount,
            status,
          });
        } catch (syncError) {
          console.error('Covered job sync failed after user-doc fallback billing save:', syncError);
        }

        return { id: `fallback:${user.uid}:${fallbackId}` };
      } catch (fallbackError) {
        if (debugContext) {
          savePipelineService.logError(debugContext, 'fallback_write_failed', fallbackError);
        }
        console.error('User-doc billing fallback failed, saving locally instead:', fallbackError);
        const localId = localFallbackStore.upsertRecord(LOCAL_BILLING_NAMESPACE, user.uid, {
          id: localFallbackStore.createLocalId(LOCAL_BILLING_NAMESPACE),
          ...fallbackRecord,
          storage_source: 'local_storage',
        });

        try {
          await syncCoveredJobs({
            ...record,
            id: localId,
            ownerId: user.uid,
            amount_paid: 0,
            balance_due: totalAmount,
            status,
          });
        } catch (syncError) {
          console.error('Covered job sync failed after local billing fallback save:', syncError);
        }

        if (debugContext) {
          savePipelineService.log(debugContext, 'fallback_write_succeeded', localId);
        }
        return { id: localId };
      }
    }
  },

  updateBillingRecord: async (id: string, updates: Partial<BillingRecord>, debugContext?: SaveDebugContext) => {
    const user = await waitForCurrentUser({ debugContext });
    if (!user) throw new Error('User not authenticated');

    try {
      if (localFallbackStore.isLocalId(id, LOCAL_BILLING_NAMESPACE)) {
        localFallbackStore.updateRecord(LOCAL_BILLING_NAMESPACE, user.uid, id, {
          ...updates,
          due_date: serializeDateValue((updates as any).due_date),
          billing_period_start: serializeDateValue((updates as any).billing_period_start),
          billing_period_end: serializeDateValue((updates as any).billing_period_end),
          paid_at: serializeDateValue((updates as any).paid_at),
          updated_at: createClientTimestamp(),
        });
        return;
      }

      if (id.startsWith('fallback:')) {
        const [, ownerId, fallbackId] = id.split(':');
        const userDocRef = doc(db, 'users', ownerId);
        const userDoc = await savePipelineService.withTimeout(getDoc(userDocRef), {
          timeoutMessage: 'Billing update timed out while loading the fallback record.',
          debugContext,
        });
        const existingFallbacks = Array.isArray(userDoc.data()?.[FALLBACK_BILLING_FIELD]) ? userDoc.data()?.[FALLBACK_BILLING_FIELD] : [];
        const nextFallbacks = existingFallbacks.map((entry: any) =>
          entry.fallback_id === fallbackId
            ? {
                ...entry,
                ...updates,
                due_date: serializeDateValue((updates as any).due_date ?? entry.due_date),
                billing_period_start: serializeDateValue((updates as any).billing_period_start ?? entry.billing_period_start),
                billing_period_end: serializeDateValue((updates as any).billing_period_end ?? entry.billing_period_end),
                paid_at: serializeDateValue((updates as any).paid_at ?? entry.paid_at),
                updated_at: createClientTimestamp(),
              }
            : entry
        );
        await savePipelineService.withTimeout(
          updateDoc(userDocRef, {
            [FALLBACK_BILLING_FIELD]: nextFallbacks,
            updated_at: serverTimestamp(),
          }),
          {
            timeoutMessage: 'Billing update timed out while writing the fallback record.',
            debugContext,
          }
        );
        return;
      }

      await savePipelineService.withTimeout(
        updateDoc(doc(db, BILLING_COLLECTION, id), {
          ...updates,
          updated_at: serverTimestamp(),
        }),
        {
          timeoutMessage: 'Billing update timed out while writing to the database.',
          debugContext,
        }
      );
    } catch (error) {
      console.error('Billing update failed, updating local fallback instead:', error);
      localFallbackStore.updateRecord(LOCAL_BILLING_NAMESPACE, user.uid, id, {
        ...updates,
        due_date: serializeDateValue((updates as any).due_date),
        billing_period_start: serializeDateValue((updates as any).billing_period_start),
        billing_period_end: serializeDateValue((updates as any).billing_period_end),
        paid_at: serializeDateValue((updates as any).paid_at),
        updated_at: createClientTimestamp(),
      });
    }
  },

  addPaymentEntry: async (
    record: Omit<PaymentEntry, 'id' | 'ownerId' | 'created_at'>,
    billingRecord: BillingRecord,
    debugContext?: SaveDebugContext
  ) => {
    if (debugContext) {
      savePipelineService.log(debugContext, 'service_called', 'billingService.addPaymentEntry');
      savePipelineService.log(debugContext, 'payload_built', {
        billingRecordId: billingRecord.id || null,
        amount: Number(record.amount || 0),
      });
    }
    const user = await waitForCurrentUser({ debugContext });
    if (!user) throw new Error('User not authenticated');

    const nextAmountPaid = Number(billingRecord.amount_paid || 0) + Number(record.amount || 0);
    const nextBalanceDue = Math.max(0, Number(billingRecord.total_amount || 0) - nextAmountPaid);
    const nextStatus = nextBalanceDue <= 0
      ? 'paid'
      : nextAmountPaid > 0
      ? 'partial'
      : getBillingStatus(Number(billingRecord.total_amount || 0), billingRecord.due_date);

    const updates: Partial<BillingRecord> = {
      amount_paid: nextAmountPaid,
      balance_due: nextBalanceDue,
      status: nextStatus,
    };

    if (nextStatus === 'paid') {
      updates.paid_at = record.received_at;
    }

    try {
      if (billingRecord.id && localFallbackStore.isLocalId(billingRecord.id, LOCAL_BILLING_NAMESPACE)) {
        const paymentLocalId = localFallbackStore.upsertRecord(LOCAL_PAYMENT_NAMESPACE, user.uid, {
          id: localFallbackStore.createLocalId(LOCAL_PAYMENT_NAMESPACE),
          ownerId: user.uid,
          billing_record_id: billingRecord.id,
          customerId: record.customerId,
          customer_name_snapshot: record.customer_name_snapshot,
          amount: Number(record.amount || 0),
          method: record.method,
          note: record.note?.trim() || '',
          received_at: serializeDateValue(record.received_at),
          created_at: createClientTimestamp(),
          source_billing_record_id: billingRecord.source_billing_record_id || billingRecord.id,
        });

        localFallbackStore.updateRecord(LOCAL_BILLING_NAMESPACE, user.uid, billingRecord.id, {
          ...updates,
          updated_at: createClientTimestamp(),
        });

        try {
          await syncCoveredJobs({
            ...billingRecord,
            ...updates,
          } as BillingRecord);
        } catch (syncError) {
          console.error('Covered job sync failed after local payment save:', syncError);
        }

        return { id: paymentLocalId };
      }

      if (billingRecord.id?.startsWith('fallback:')) {
        const [_, ownerId, fallbackId] = billingRecord.id.split(':');
        const fallbackTimestamp = createClientTimestamp();
        const paymentFallbackId = createFallbackId('payment');
        const userDocRef = doc(db, 'users', ownerId);
        const userDoc = await savePipelineService.withTimeout(getDoc(userDocRef), {
          timeoutMessage: 'Payment save timed out while loading the fallback billing record.',
          debugContext,
        });
        const existingBilling = Array.isArray(userDoc.data()?.[FALLBACK_BILLING_FIELD]) ? userDoc.data()?.[FALLBACK_BILLING_FIELD] : [];
        const nextBilling = existingBilling.map((entry: any) =>
          entry.fallback_id === fallbackId
            ? {
                ...entry,
                amount_paid: nextAmountPaid,
                balance_due: nextBalanceDue,
                status: nextStatus,
                paid_at: nextStatus === 'paid' ? serializeDateValue(record.received_at) : entry.paid_at || null,
                updated_at: fallbackTimestamp,
              }
            : entry
        );

        if (debugContext) {
          savePipelineService.log(debugContext, 'fallback_write_attempted', `fallback:${ownerId}:${fallbackId}`);
        }
        await savePipelineService.withTimeout(
          updateDoc(userDocRef, {
            [FALLBACK_BILLING_FIELD]: nextBilling,
            [FALLBACK_PAYMENT_FIELD]: arrayUnion({
              fallback_id: paymentFallbackId,
              ownerId: user.uid,
              billing_record_id: billingRecord.id,
              customerId: record.customerId,
              customer_name_snapshot: record.customer_name_snapshot,
              amount: Number(record.amount || 0),
              method: record.method,
              note: record.note?.trim() || '',
              received_at: serializeDateValue(record.received_at),
              created_at: fallbackTimestamp,
            }),
            updated_at: serverTimestamp(),
          }),
          {
            timeoutMessage: 'Payment save timed out while writing the fallback record.',
            debugContext,
          }
        );
        if (debugContext) {
          savePipelineService.log(debugContext, 'fallback_write_succeeded', `fallback:${ownerId}:${paymentFallbackId}`);
        }

        try {
          await syncCoveredJobs({
            ...billingRecord,
            amount_paid: nextAmountPaid,
            balance_due: nextBalanceDue,
            status: nextStatus,
          } as BillingRecord);
        } catch (syncError) {
          console.error('Covered job sync failed after fallback payment save:', syncError);
        }
        return { id: `fallback:${ownerId}:${paymentFallbackId}` };
      }

      if (debugContext) {
        savePipelineService.log(debugContext, 'db_write_attempted', PAYMENT_COLLECTION);
      }
      const paymentRef = await savePipelineService.withTimeout(
        addDoc(collection(db, PAYMENT_COLLECTION), {
          ...record,
          ownerId: user.uid,
          created_at: serverTimestamp(),
        }),
        {
          timeoutMessage: 'Payment save timed out while writing the payment entry.',
          debugContext,
        }
      );
      if (debugContext) {
        savePipelineService.log(debugContext, 'db_write_succeeded', paymentRef.id);
      }

      await billingService.updateBillingRecord(billingRecord.id!, updates, debugContext);
      try {
        await syncCoveredJobs({
          ...billingRecord,
          ...updates,
        } as BillingRecord);
      } catch (syncError) {
        console.error('Covered job sync failed after primary payment save:', syncError);
      }
      return paymentRef;
    } catch (error) {
      if (debugContext) {
        savePipelineService.logError(debugContext, 'db_write_failed', error);
        savePipelineService.log(debugContext, 'fallback_write_attempted', 'payment_local_fallback');
      }
      console.error('Primary payment save failed, using fallback storage:', error);
      const fallbackTimestamp = createClientTimestamp();
      const paymentFallbackId = createFallbackId('payment');
      const mirroredBillingId = billingRecord.id || createFallbackId('billing');
      const fallbackPaymentRecord = {
        fallback_id: paymentFallbackId,
        source_billing_record_id: mirroredBillingId,
        ownerId: user.uid,
        billing_record_id: mirroredBillingId,
        customerId: record.customerId,
        customer_name_snapshot: record.customer_name_snapshot,
        amount: Number(record.amount || 0),
        method: record.method,
        note: record.note?.trim() || '',
        received_at: serializeDateValue(record.received_at),
        created_at: fallbackTimestamp,
      };

      try {
        const userDocRef = doc(db, 'users', user.uid);
        const userDoc = await savePipelineService.withTimeout(getDoc(userDocRef), {
          timeoutMessage: 'Payment fallback save timed out while loading the user document.',
          debugContext,
        });
        const existingBilling = Array.isArray(userDoc.data()?.[FALLBACK_BILLING_FIELD]) ? userDoc.data()?.[FALLBACK_BILLING_FIELD] : [];
        const existingPayments = Array.isArray(userDoc.data()?.[FALLBACK_PAYMENT_FIELD]) ? userDoc.data()?.[FALLBACK_PAYMENT_FIELD] : [];
        const hasMirroredBilling = existingBilling.some((entry: any) => entry.source_billing_record_id === mirroredBillingId || entry.fallback_id === mirroredBillingId);
        const nextBillingArray = hasMirroredBilling
          ? existingBilling.map((entry: any) =>
              entry.source_billing_record_id === mirroredBillingId || entry.fallback_id === mirroredBillingId
                ? {
                    ...entry,
                    amount_paid: nextAmountPaid,
                    balance_due: nextBalanceDue,
                    status: nextStatus,
                    paid_at: nextStatus === 'paid' ? serializeDateValue(record.received_at) : entry.paid_at || null,
                    updated_at: fallbackTimestamp,
                  }
                : entry
            )
          : [
              ...existingBilling,
              {
                fallback_id: createFallbackId('billing'),
                source_billing_record_id: mirroredBillingId,
                ownerId: user.uid,
                customerId: billingRecord.customerId,
                customer_name_snapshot: billingRecord.customer_name_snapshot,
                label: billingRecord.label,
                billing_type: billingRecord.billing_type,
                billing_frequency: billingRecord.billing_frequency,
                status: nextStatus,
                source: billingRecord.source,
                total_amount: Number(billingRecord.total_amount || 0),
                amount_paid: nextAmountPaid,
                balance_due: nextBalanceDue,
                covered_job_ids: billingRecord.covered_job_ids || [],
                covered_service_count: Number(billingRecord.covered_service_count || 0),
                auto_bill_enabled: !!billingRecord.auto_bill_enabled,
                billing_period_key: billingRecord.billing_period_key || '',
                billing_period_start: serializeDateValue(billingRecord.billing_period_start),
                billing_period_end: serializeDateValue(billingRecord.billing_period_end),
                due_date: serializeDateValue(billingRecord.due_date),
                paid_at: nextStatus === 'paid' ? serializeDateValue(record.received_at) : serializeDateValue(billingRecord.paid_at),
                notes: billingRecord.notes || '',
                created_at: serializeDateValue(billingRecord.created_at) || fallbackTimestamp,
                updated_at: fallbackTimestamp,
              },
            ];
        const shouldCreateFallbackPayment = !existingPayments.some((entry: any) =>
          (entry.source_billing_record_id === mirroredBillingId || entry.billing_record_id === mirroredBillingId) &&
          Number(entry.amount || 0) === Number(record.amount || 0) &&
          serializeDateValue(entry.received_at) === serializeDateValue(record.received_at)
        );

        await savePipelineService.withTimeout(
          updateDoc(userDocRef, {
            [FALLBACK_BILLING_FIELD]: nextBillingArray,
            ...(shouldCreateFallbackPayment ? {
              [FALLBACK_PAYMENT_FIELD]: arrayUnion(fallbackPaymentRecord),
            } : {}),
            updated_at: serverTimestamp(),
          }),
          {
            timeoutMessage: 'Payment fallback save timed out while writing the user document.',
            debugContext,
          }
        );
        if (debugContext) {
          savePipelineService.log(debugContext, 'fallback_write_succeeded', `fallback:${user.uid}:${paymentFallbackId}`);
        }
      } catch (fallbackError) {
        if (debugContext) {
          savePipelineService.logError(debugContext, 'fallback_write_failed', fallbackError);
        }
        console.error('User-doc payment fallback failed, saving locally instead:', fallbackError);
        const localBillingId = billingRecord.id && localFallbackStore.isLocalId(billingRecord.id)
          ? billingRecord.id
          : localFallbackStore.upsertRecord(LOCAL_BILLING_NAMESPACE, user.uid, {
              id: localFallbackStore.createLocalId(LOCAL_BILLING_NAMESPACE),
              source_billing_record_id: mirroredBillingId,
              ownerId: user.uid,
              customerId: billingRecord.customerId,
              customer_name_snapshot: billingRecord.customer_name_snapshot,
              label: billingRecord.label,
              billing_type: billingRecord.billing_type,
              billing_frequency: billingRecord.billing_frequency,
              status: nextStatus,
              source: billingRecord.source,
              total_amount: Number(billingRecord.total_amount || 0),
              amount_paid: nextAmountPaid,
              balance_due: nextBalanceDue,
              covered_job_ids: billingRecord.covered_job_ids || [],
              covered_service_count: Number(billingRecord.covered_service_count || 0),
              auto_bill_enabled: !!billingRecord.auto_bill_enabled,
              billing_period_key: billingRecord.billing_period_key || '',
              billing_period_start: serializeDateValue(billingRecord.billing_period_start),
              billing_period_end: serializeDateValue(billingRecord.billing_period_end),
              due_date: serializeDateValue(billingRecord.due_date),
              paid_at: nextStatus === 'paid' ? serializeDateValue(record.received_at) : serializeDateValue(billingRecord.paid_at),
              notes: billingRecord.notes || '',
              created_at: serializeDateValue(billingRecord.created_at) || fallbackTimestamp,
              updated_at: fallbackTimestamp,
              storage_source: 'local_storage',
            });

        localFallbackStore.updateRecord(LOCAL_BILLING_NAMESPACE, user.uid, localBillingId, {
          ...updates,
          updated_at: fallbackTimestamp,
        });

        localFallbackStore.upsertRecord(LOCAL_PAYMENT_NAMESPACE, user.uid, {
          id: localFallbackStore.createLocalId(LOCAL_PAYMENT_NAMESPACE),
          ...fallbackPaymentRecord,
          billing_record_id: localBillingId,
          storage_source: 'local_storage',
        });
        if (debugContext) {
          savePipelineService.log(debugContext, 'fallback_write_succeeded', localBillingId);
        }
      }

      try {
        await syncCoveredJobs({
          ...billingRecord,
          amount_paid: nextAmountPaid,
          balance_due: nextBalanceDue,
          status: nextStatus,
        } as BillingRecord);
      } catch (syncError) {
        console.error('Covered job sync failed after fallback payment save:', syncError);
      }
    }
  },

  recordManualPayment: async (payment: ManualPaymentInput, debugContext?: SaveDebugContext) => {
    if (debugContext) {
      savePipelineService.log(debugContext, 'service_called', 'billingService.recordManualPayment');
      savePipelineService.log(debugContext, 'payload_built', {
        customerId: payment.customerId,
        amount: Number(payment.amount || 0),
      });
    }
    const user = await waitForCurrentUser({ debugContext });
    if (!user) throw new Error('User not authenticated');

    const amount = Number(payment.amount || 0);
    if (amount <= 0) {
      throw new Error('Payment amount must be greater than zero.');
    }

    const receivedAt = payment.received_at || Timestamp.fromDate(new Date());

    try {
      let billingRef: { id: string } | null = null;

      if (debugContext) {
        savePipelineService.log(debugContext, 'db_write_attempted', BILLING_COLLECTION);
      }
      billingRef = await savePipelineService.withTimeout(
        addDoc(collection(db, BILLING_COLLECTION), {
          ownerId: user.uid,
          customerId: payment.customerId,
          customer_name_snapshot: payment.customer_name_snapshot,
          label: payment.label?.trim() || `Manual Payment - ${payment.customer_name_snapshot}`,
          billing_type: 'one_time',
          billing_frequency: 'manual_payment',
          status: 'paid',
          source: 'manual',
          total_amount: amount,
          amount_paid: amount,
          balance_due: 0,
          covered_job_ids: [],
          covered_service_count: 0,
          auto_bill_enabled: false,
          due_date: receivedAt,
          paid_at: receivedAt,
          notes: payment.note?.trim() || 'Manual payment recorded before an open billing record existed.',
          created_at: serverTimestamp(),
          updated_at: serverTimestamp(),
        }),
        {
          timeoutMessage: 'Manual payment timed out while creating the billing record.',
          debugContext,
        }
      );
      if (debugContext) {
        savePipelineService.log(debugContext, 'db_write_succeeded', billingRef.id);
      }

      try {
        await savePipelineService.withTimeout(
          addDoc(collection(db, PAYMENT_COLLECTION), {
            ownerId: user.uid,
            billing_record_id: billingRef.id,
            customerId: payment.customerId,
            customer_name_snapshot: payment.customer_name_snapshot,
            amount,
            method: payment.method,
            note: payment.note?.trim() || '',
            received_at: receivedAt,
            created_at: serverTimestamp(),
          }),
          {
            timeoutMessage: 'Manual payment timed out while creating the payment entry.',
            debugContext,
          }
        );
      } catch (paymentError) {
        if (debugContext) {
          savePipelineService.logError(debugContext, 'db_write_failed', paymentError);
          savePipelineService.log(debugContext, 'fallback_write_attempted', 'users/{uid}.payment_entry_fallbacks');
        }
        console.error('Primary manual payment entry save failed, using fallback payment storage:', paymentError);
        const paymentFallbackRecord = {
          fallback_id: createFallbackId('payment'),
          source_billing_record_id: billingRef.id,
          ownerId: user.uid,
          billing_record_id: billingRef.id,
          customerId: payment.customerId,
          customer_name_snapshot: payment.customer_name_snapshot,
          amount,
          method: payment.method,
          note: payment.note?.trim() || '',
          received_at: serializeDateValue(receivedAt),
          created_at: createClientTimestamp(),
        };

        try {
          await savePipelineService.withTimeout(
            updateDoc(doc(db, 'users', user.uid), {
              [FALLBACK_PAYMENT_FIELD]: arrayUnion(paymentFallbackRecord),
              updated_at: serverTimestamp(),
            }),
            {
              timeoutMessage: 'Manual payment fallback timed out while writing the user document.',
              debugContext,
            }
          );
          if (debugContext) {
            savePipelineService.log(debugContext, 'fallback_write_succeeded', `fallback:${user.uid}:${paymentFallbackRecord.fallback_id}`);
          }
        } catch (fallbackError) {
          if (debugContext) {
            savePipelineService.logError(debugContext, 'fallback_write_failed', fallbackError);
          }
          console.error('User-doc manual payment fallback failed, saving locally instead:', fallbackError);
          localFallbackStore.upsertRecord(LOCAL_PAYMENT_NAMESPACE, user.uid, {
            id: localFallbackStore.createLocalId(LOCAL_PAYMENT_NAMESPACE),
            ...paymentFallbackRecord,
            storage_source: 'local_storage',
          });
          if (debugContext) {
            savePipelineService.log(debugContext, 'fallback_write_succeeded', LOCAL_PAYMENT_NAMESPACE);
          }
        }
      }

      return billingRef;
    } catch (error) {
      if (debugContext) {
        savePipelineService.logError(debugContext, 'db_write_failed', error);
        savePipelineService.log(debugContext, 'fallback_write_attempted', 'manual_payment_local_fallback');
      }
      console.error('Primary manual payment save failed, using fallback storage:', error);
      const fallbackTimestamp = createClientTimestamp();
      const billingFallbackId = createFallbackId('billing');
      const paymentFallbackId = createFallbackId('payment');
      const fallbackBillingRecord = {
        fallback_id: billingFallbackId,
        ownerId: user.uid,
        customerId: payment.customerId,
        customer_name_snapshot: payment.customer_name_snapshot,
        label: payment.label?.trim() || `Manual Payment - ${payment.customer_name_snapshot}`,
        billing_type: 'one_time',
        billing_frequency: 'manual_payment',
        status: 'paid',
        source: 'manual',
        total_amount: amount,
        amount_paid: amount,
        balance_due: 0,
        covered_job_ids: [],
        covered_service_count: 0,
        auto_bill_enabled: false,
        due_date: serializeDateValue(receivedAt),
        paid_at: serializeDateValue(receivedAt),
        notes: payment.note?.trim() || 'Manual payment recorded before an open billing record existed.',
        created_at: fallbackTimestamp,
        updated_at: fallbackTimestamp,
      };
      const fallbackPaymentRecord = {
        fallback_id: paymentFallbackId,
        ownerId: user.uid,
        billing_record_id: `fallback:${user.uid}:${billingFallbackId}`,
        customerId: payment.customerId,
        customer_name_snapshot: payment.customer_name_snapshot,
        amount,
        method: payment.method,
        note: payment.note?.trim() || '',
        received_at: serializeDateValue(receivedAt),
        created_at: fallbackTimestamp,
      };

      try {
        await savePipelineService.withTimeout(
          updateDoc(doc(db, 'users', user.uid), {
            [FALLBACK_BILLING_FIELD]: arrayUnion(fallbackBillingRecord),
            [FALLBACK_PAYMENT_FIELD]: arrayUnion(fallbackPaymentRecord),
            updated_at: serverTimestamp(),
          }),
          {
            timeoutMessage: 'Manual payment fallback timed out while writing the user document.',
            debugContext,
          }
        );
        if (debugContext) {
          savePipelineService.log(debugContext, 'fallback_write_succeeded', `fallback:${user.uid}:${billingFallbackId}`);
        }

        return { id: `fallback:${user.uid}:${billingFallbackId}` };
      } catch (fallbackError) {
        if (debugContext) {
          savePipelineService.logError(debugContext, 'fallback_write_failed', fallbackError);
        }
        console.error('User-doc manual payment save failed, saving locally instead:', fallbackError);
        const localBillingId = localFallbackStore.upsertRecord(LOCAL_BILLING_NAMESPACE, user.uid, {
          id: localFallbackStore.createLocalId(LOCAL_BILLING_NAMESPACE),
          ...fallbackBillingRecord,
          storage_source: 'local_storage',
        });
        localFallbackStore.upsertRecord(LOCAL_PAYMENT_NAMESPACE, user.uid, {
          id: localFallbackStore.createLocalId(LOCAL_PAYMENT_NAMESPACE),
          ...fallbackPaymentRecord,
          billing_record_id: localBillingId,
          storage_source: 'local_storage',
        });

        if (debugContext) {
          savePipelineService.log(debugContext, 'fallback_write_succeeded', localBillingId);
        }
        return { id: localBillingId };
      }
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
