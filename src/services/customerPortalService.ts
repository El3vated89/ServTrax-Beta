import {
  collection,
  deleteDoc,
  doc,
  getDoc,
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
import { waitForCurrentUser } from './authSessionService';
import { BillingFramework, BusinessPlanProfile, planConfigService } from './planConfigService';

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
  portal_token?: string;
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
  portal_token?: string;
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

const INTERNAL_PORTAL_COLLECTION = 'customer_portals';
const INTERNAL_PORTAL_HISTORY_COLLECTION = 'customer_portal_job_history';
const INTERNAL_PORTAL_QUOTES_COLLECTION = 'customer_portal_quotes';
const PUBLIC_PORTAL_COLLECTION = 'public_customer_portals';
const PUBLIC_PORTAL_HISTORY_COLLECTION = 'public_customer_portal_job_history';
const PUBLIC_PORTAL_QUOTES_COLLECTION = 'public_customer_portal_quotes';

const buildAddress = (customer: Customer) =>
  [customer.street, customer.line2, customer.city, customer.state, customer.zip].filter(Boolean).join(', ');

const quoteItemFromJob = (customer: Customer, job: Job): CustomerPortalQuoteItem => ({
  customerId: customer.id || '',
  ownerId: customer.ownerId,
  portal_token: customer.portal_token,
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
  portal_token: customer.portal_token,
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

const deletePublicPortalSnapshots = async (portalToken?: string) => {
  if (!portalToken) return;

  const [portalSnap, historySnap, quoteSnap] = await Promise.all([
    getDoc(doc(db, PUBLIC_PORTAL_COLLECTION, portalToken)),
    getDocs(query(collection(db, PUBLIC_PORTAL_HISTORY_COLLECTION), where('portal_token', '==', portalToken))),
    getDocs(query(collection(db, PUBLIC_PORTAL_QUOTES_COLLECTION), where('portal_token', '==', portalToken))),
  ]);

  const batch = writeBatch(db);
  let operationCount = 0;

  if (portalSnap.exists()) {
    batch.delete(portalSnap.ref);
    operationCount += 1;
  }

  historySnap.docs.forEach((entry) => {
    batch.delete(entry.ref);
    operationCount += 1;
  });

  quoteSnap.docs.forEach((entry) => {
    batch.delete(entry.ref);
    operationCount += 1;
  });

  if (operationCount > 0) {
    await batch.commit();
  }
};

export const customerPortalService = {
  getCapabilities: (
    profileOrPlan?: BusinessPlanProfile | string | null,
    framework?: BillingFramework | null
  ): PortalCapabilities => {
    const profile = typeof profileOrPlan === 'string'
      ? { plan_name: profileOrPlan }
      : profileOrPlan || undefined;
    const resolvedPlan = planConfigService.resolveBusinessPlan(profile, framework);

    return {
      allowsPortal: resolvedPlan.featureFlags.customer_portal,
      allowsPersistentPortal: resolvedPlan.featureFlags.persistent_portal,
      planLabel: resolvedPlan.planLabel,
    };
  },

  buildPortalLink: (customerId: string, portalToken: string) =>
    `${getPublicOrigin()}/#/portal/${customerId}/${portalToken}`,

  createPortalToken: () =>
    `${Math.random().toString(36).slice(2, 15)}${Math.random().toString(36).slice(2, 15)}`,

  disablePortal: async (customerId: string) => {
    const user = await waitForCurrentUser();
    if (!user || !customerId) return;

    const portalSnap = await getDoc(doc(db, INTERNAL_PORTAL_COLLECTION, customerId));
    const existingPortalToken = portalSnap.exists() ? String(portalSnap.data().portal_token || '') : '';
    await deletePublicPortalSnapshots(existingPortalToken);

    const batch = writeBatch(db);

    const portalHistorySnapshot = await getDocs(
      query(collection(db, INTERNAL_PORTAL_HISTORY_COLLECTION), where('customerId', '==', customerId))
    );
    portalHistorySnapshot.docs.forEach((entry) => batch.delete(entry.ref));

    const portalQuoteSnapshot = await getDocs(
      query(collection(db, INTERNAL_PORTAL_QUOTES_COLLECTION), where('customerId', '==', customerId))
    );
    portalQuoteSnapshot.docs.forEach((entry) => batch.delete(entry.ref));

    batch.delete(doc(db, INTERNAL_PORTAL_COLLECTION, customerId));
    await batch.commit();
  },

  syncPortalContent: async (
    customer: Customer,
    jobs: Job[],
    quotes: Quote[],
    planName?: string
  ) => {
    const user = await waitForCurrentUser();
    if (!user || !customer.id) return;

    if (!customer.portal_enabled || !customer.portal_token) {
      await customerPortalService.disablePortal(customer.id);
      return;
    }

    const existingPortalSnap = await getDoc(doc(db, INTERNAL_PORTAL_COLLECTION, customer.id));
    const previousPortalToken = existingPortalSnap.exists()
      ? String(existingPortalSnap.data().portal_token || '')
      : '';

    if (previousPortalToken && previousPortalToken !== customer.portal_token) {
      await deletePublicPortalSnapshots(previousPortalToken);
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

    await setDoc(doc(db, INTERNAL_PORTAL_COLLECTION, customer.id), portalDoc, { merge: true });

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
        portal_token: customer.portal_token,
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
      query(collection(db, INTERNAL_PORTAL_HISTORY_COLLECTION), where('customerId', '==', customer.id))
    );
    const quoteSnapshot = await getDocs(
      query(collection(db, INTERNAL_PORTAL_QUOTES_COLLECTION), where('customerId', '==', customer.id))
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
      batch.set(doc(db, INTERNAL_PORTAL_HISTORY_COLLECTION, item.id), item);
    });

    quoteDocs.forEach((item) => {
      batch.set(doc(db, INTERNAL_PORTAL_QUOTES_COLLECTION, `${item.source_type}_${item.source_id}`), {
        ...item,
        portal_visible: !!customer.portal_show_quotes,
      });
    });

    await batch.commit();

    const publicPortalDoc: CustomerPortalRecord = {
      ...portalDoc,
      created_at: existingPortalSnap.exists() ? existingPortalSnap.data().created_at || serverTimestamp() : serverTimestamp(),
    };

    await setDoc(doc(db, PUBLIC_PORTAL_COLLECTION, customer.portal_token), publicPortalDoc, { merge: true });

    const publicHistorySnapshot = await getDocs(
      query(collection(db, PUBLIC_PORTAL_HISTORY_COLLECTION), where('portal_token', '==', customer.portal_token))
    );
    const publicQuoteSnapshot = await getDocs(
      query(collection(db, PUBLIC_PORTAL_QUOTES_COLLECTION), where('portal_token', '==', customer.portal_token))
    );

    const publicBatch = writeBatch(db);
    const nextPublicHistoryIds = new Set(historyDocs.map((item) => `${customer.portal_token}_${item.id}`));
    const nextPublicQuoteIds = new Set(quoteDocs.map((item) => `${customer.portal_token}_${item.source_type}_${item.source_id}`));

    publicHistorySnapshot.docs.forEach((entry) => {
      if (!nextPublicHistoryIds.has(entry.id)) {
        publicBatch.delete(entry.ref);
      }
    });

    publicQuoteSnapshot.docs.forEach((entry) => {
      if (!nextPublicQuoteIds.has(entry.id)) {
        publicBatch.delete(entry.ref);
      }
    });

    historyDocs.forEach((item) => {
      publicBatch.set(doc(db, PUBLIC_PORTAL_HISTORY_COLLECTION, `${customer.portal_token}_${item.id}`), {
        ...item,
        portal_token: customer.portal_token,
      });
    });

    quoteDocs.forEach((item) => {
      publicBatch.set(doc(db, PUBLIC_PORTAL_QUOTES_COLLECTION, `${customer.portal_token}_${item.source_type}_${item.source_id}`), {
        ...item,
        portal_token: customer.portal_token,
        portal_visible: !!customer.portal_show_quotes,
      });
    });

    await publicBatch.commit();
  },
};
