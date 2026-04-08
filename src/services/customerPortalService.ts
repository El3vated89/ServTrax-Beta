import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { getPublicOrigin } from '../utils';
import { Customer } from './customerService';
import { Job } from './jobService';
import { Quote } from './quoteService';

export interface PortalCapabilities {
  allowsPortal: boolean;
  allowsPersistentPortal: boolean;
  planLabel: string;
}

export interface CustomerPortalRecord {
  customerId: string;
  ownerId: string;
  portal_enabled: boolean;
  portal_token: string;
  portal_show_history: boolean;
  portal_show_payment_status: boolean;
  portal_show_quotes: boolean;
  portal_plan_name_snapshot: string;
  customer_name_snapshot: string;
  address_snapshot: string;
  updated_at?: any;
  created_at?: any;
}

export interface CustomerPortalHistoryItem {
  id?: string;
  customerId: string;
  ownerId: string;
  portal_visible: boolean;
  proof_job_id: string;
  share_token: string;
  service_snapshot: string;
  address_snapshot: string;
  status: string;
  payment_status: string;
  price_snapshot: number;
  scheduled_date?: any;
  completed_date?: any;
  created_at?: any;
  updated_at?: any;
}

export interface CustomerPortalQuoteItem {
  id?: string;
  customerId: string;
  ownerId: string;
  portal_visible: boolean;
  source_type: 'job_quote' | 'quote';
  source_id: string;
  service_snapshot: string;
  address_snapshot: string;
  status: string;
  billing_frequency?: string;
  price_snapshot: number;
  created_at?: any;
  updated_at?: any;
}

const normalizePlanName = (planName?: string) => (planName || 'Free').trim().toLowerCase();

const buildAddress = (customer: Customer) =>
  [customer.street, customer.line2, customer.city, customer.state, customer.zip].filter(Boolean).join(', ');

const quoteItemFromJob = (customer: Customer, job: Job): CustomerPortalQuoteItem => ({
  customerId: customer.id || '',
  ownerId: customer.ownerId,
  portal_visible: true,
  source_type: 'job_quote',
  source_id: job.id || '',
  service_snapshot: job.service_snapshot,
  address_snapshot: job.address_snapshot,
  status: job.status,
  billing_frequency: job.billing_frequency,
  price_snapshot: job.price_snapshot || 0,
  created_at: job.created_at || serverTimestamp(),
  updated_at: serverTimestamp(),
});

const quoteItemFromQuote = (customer: Customer, quote: Quote): CustomerPortalQuoteItem => ({
  customerId: customer.id || '',
  ownerId: customer.ownerId,
  portal_visible: true,
  source_type: 'quote',
  source_id: quote.id || '',
  service_snapshot: quote.service_snapshot,
  address_snapshot: quote.address_snapshot,
  status: quote.status,
  billing_frequency: quote.billing_frequency,
  price_snapshot: quote.price_snapshot || 0,
  created_at: quote.created_at || serverTimestamp(),
  updated_at: serverTimestamp(),
});

export const customerPortalService = {
  getCapabilities: (planName?: string): PortalCapabilities => {
    const normalized = normalizePlanName(planName);

    if (normalized.includes('pro')) {
      return {
        allowsPortal: true,
        allowsPersistentPortal: true,
        planLabel: 'Pro',
      };
    }

    if (normalized.includes('starter lite')) {
      return {
        allowsPortal: false,
        allowsPersistentPortal: false,
        planLabel: 'Starter Lite',
      };
    }

    if (normalized === 'starter' || normalized.includes('starter')) {
      return {
        allowsPortal: true,
        allowsPersistentPortal: true,
        planLabel: 'Starter',
      };
    }

    return {
      allowsPortal: false,
      allowsPersistentPortal: false,
      planLabel: normalized.includes('lite') ? 'Starter Lite' : 'Free',
    };
  },

  buildPortalLink: (customerId: string, portalToken: string) =>
    `${getPublicOrigin()}/#/portal/${customerId}/${portalToken}`,

  createPortalToken: () =>
    `${Math.random().toString(36).slice(2, 15)}${Math.random().toString(36).slice(2, 15)}`,

  disablePortal: async (customerId: string) => {
    if (!auth.currentUser || !customerId) return;

    const batch = writeBatch(db);

    const portalHistorySnapshot = await getDocs(
      query(collection(db, 'customer_portal_job_history'), where('customerId', '==', customerId))
    );
    portalHistorySnapshot.docs.forEach((entry) => batch.delete(entry.ref));

    const portalQuoteSnapshot = await getDocs(
      query(collection(db, 'customer_portal_quotes'), where('customerId', '==', customerId))
    );
    portalQuoteSnapshot.docs.forEach((entry) => batch.delete(entry.ref));

    batch.delete(doc(db, 'customer_portals', customerId));
    await batch.commit();
  },

  syncPortalContent: async (
    customer: Customer,
    jobs: Job[],
    quotes: Quote[],
    planName?: string
  ) => {
    const user = auth.currentUser;
    if (!user || !customer.id) return;

    if (!customer.portal_enabled || !customer.portal_token) {
      await customerPortalService.disablePortal(customer.id);
      return;
    }

    const portalDoc: CustomerPortalRecord = {
      customerId: customer.id,
      ownerId: customer.ownerId,
      portal_enabled: true,
      portal_token: customer.portal_token,
      portal_show_history: !!customer.portal_show_history,
      portal_show_payment_status: !!customer.portal_show_payment_status,
      portal_show_quotes: !!customer.portal_show_quotes,
      portal_plan_name_snapshot: customer.portal_plan_name_snapshot || planName || 'Starter',
      customer_name_snapshot: customer.name,
      address_snapshot: buildAddress(customer),
      updated_at: serverTimestamp(),
      created_at: serverTimestamp(),
    };

    await setDoc(doc(db, 'customer_portals', customer.id), portalDoc, { merge: true });

    const historyDocs = jobs
      .filter((job) =>
        job.customerId === customer.id &&
        job.visibility_mode === 'shareable' &&
        job.status !== 'quote' &&
        !!job.share_token
      )
      .map((job) => ({
        id: job.id || '',
        customerId: customer.id || '',
        ownerId: customer.ownerId,
        portal_visible: !!customer.portal_show_history,
        proof_job_id: job.id || '',
        share_token: job.share_token || '',
        service_snapshot: job.service_snapshot,
        address_snapshot: job.address_snapshot,
        status: job.status,
        payment_status: job.payment_status,
        price_snapshot: job.price_snapshot || 0,
        scheduled_date: job.scheduled_date || null,
        completed_date: job.completed_date || null,
        created_at: job.created_at || serverTimestamp(),
        updated_at: serverTimestamp(),
      } satisfies CustomerPortalHistoryItem));

    const quoteDocs = [
      ...jobs
        .filter((job) => job.customerId === customer.id && job.status === 'quote')
        .map((job) => quoteItemFromJob(customer, job)),
      ...quotes
        .filter((quote) => quote.customerId === customer.id)
        .map((quote) => quoteItemFromQuote(customer, quote)),
    ];

    const historySnapshot = await getDocs(
      query(collection(db, 'customer_portal_job_history'), where('customerId', '==', customer.id))
    );
    const quoteSnapshot = await getDocs(
      query(collection(db, 'customer_portal_quotes'), where('customerId', '==', customer.id))
    );

    const batch = writeBatch(db);
    const nextHistoryIds = new Set(historyDocs.map((item) => item.id));
    const nextQuoteIds = new Set(quoteDocs.map((item) => `${item.source_type}_${item.source_id}`));

    historySnapshot.docs.forEach((entry) => {
      if (!nextHistoryIds.has(entry.id)) {
        batch.delete(entry.ref);
      }
    });

    quoteSnapshot.docs.forEach((entry) => {
      if (!nextQuoteIds.has(entry.id)) {
        batch.delete(entry.ref);
      }
    });

    historyDocs.forEach((item) => {
      batch.set(doc(db, 'customer_portal_job_history', item.id), item);
    });

    quoteDocs.forEach((item) => {
      batch.set(doc(db, 'customer_portal_quotes', `${item.source_type}_${item.source_id}`), {
        ...item,
        portal_visible: !!customer.portal_show_quotes,
      });
    });

    await batch.commit();
  },
};
