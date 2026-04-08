import { db, auth } from '../firebase';
import { collection, addDoc, onSnapshot, query, where, serverTimestamp, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { waitForCurrentUser } from './authSessionService';
import { localFallbackStore } from './localFallbackStore';

export interface MessageTemplate {
  id?: string;
  name: string;
  content: string;
  ownerId?: string;
  created_at?: any;
}

const COLLECTION_NAME = 'message_templates';
const LOCAL_FALLBACK_NAMESPACE = 'message_templates';
type LocalMessageTemplate = MessageTemplate & { _local_deleted?: boolean };
const templateCache = new Map<string, MessageTemplate>();
const toClientTimestamp = () => new Date().toISOString();

export interface ProofMessageContext {
  customerName?: string;
  serviceName?: string;
  price?: number | string;
  proofLink: string;
  paymentDue?: boolean;
}

const normalizeLocalTemplate = (ownerId: string, entry: Partial<LocalMessageTemplate>): MessageTemplate => ({
  id: entry.id,
  name: entry.name || '',
  content: entry.content || '',
  ownerId,
  created_at: entry.created_at as any,
});

const mergeTemplates = (primaryTemplates: MessageTemplate[], localTemplates: LocalMessageTemplate[]) => {
  const next = new Map<string, MessageTemplate>();

  primaryTemplates.forEach((template) => {
    if (!template.id) return;
    next.set(template.id, template);
  });

  localTemplates.forEach((template) => {
    if (!template.id) return;
    if (template._local_deleted) {
      next.delete(template.id);
      return;
    }
    next.set(template.id, normalizeLocalTemplate(template.ownerId || '', template));
  });

  const merged = Array.from(next.values());
  templateCache.clear();
  merged.forEach((template) => {
    if (template.id) templateCache.set(template.id, template);
  });
  return merged;
};

export const renderProofMessage = (template: MessageTemplate | null | undefined, context: ProofMessageContext) => {
  const customerName = context.customerName || 'customer';
  const serviceName = context.serviceName || 'service';
  const price = context.price ?? '0.00';

  if (!template?.content) {
    return `Hi ${customerName}, your ${serviceName} is complete! ${context.paymentDue ? `The total is $${price}. ` : ''}View proof here: ${context.proofLink}`;
  }

  return template.content
    .replaceAll('{customer}', customerName)
    .replaceAll('{service}', serviceName)
    .replaceAll('{price}', String(price))
    .replaceAll('{link}', context.proofLink);
};

export const templateService = {
  subscribeToTemplates: (callback: (templates: MessageTemplate[]) => void) => {
    let unsubscribeSnapshot: () => void = () => {};
    let unsubscribeLocal: () => void = () => {};
    let primaryTemplates: MessageTemplate[] = [];
    let localTemplates: LocalMessageTemplate[] = [];

    const emit = () => callback(mergeTemplates(primaryTemplates, localTemplates));

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      unsubscribeSnapshot();
      unsubscribeLocal();
      primaryTemplates = [];
      localTemplates = [];

      if (!user) {
        templateCache.clear();
        callback([]);
        return;
      }

      const q = query(
        collection(db, COLLECTION_NAME),
        where('ownerId', '==', user.uid)
      );

      unsubscribeSnapshot = onSnapshot(q, (snapshot) => {
        primaryTemplates = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as MessageTemplate[];
        emit();
      }, (error) => {
        console.error('Primary message template subscription failed, using local fallback only:', error);
        primaryTemplates = [];
        emit();
      });

      unsubscribeLocal = localFallbackStore.subscribeToRecords<LocalMessageTemplate>(LOCAL_FALLBACK_NAMESPACE, user.uid, (records) => {
        localTemplates = records;
        emit();
      });
    });

    return () => {
      unsubscribeSnapshot();
      unsubscribeLocal();
      unsubscribeAuth();
    };
  },

  addTemplate: async (template: Omit<MessageTemplate, 'id' | 'ownerId' | 'created_at'>) => {
    const user = await waitForCurrentUser();
    if (!user) throw new Error('Must be logged in to add template');

    const newTemplate = {
      ...template,
      ownerId: user.uid,
      created_at: serverTimestamp()
    };

    try {
      return await addDoc(collection(db, COLLECTION_NAME), newTemplate);
    } catch (error) {
      console.error('Primary message template save failed, saving locally instead:', error);
      const localId = localFallbackStore.upsertRecord<LocalMessageTemplate>(LOCAL_FALLBACK_NAMESPACE, user.uid, {
        id: localFallbackStore.createLocalId(LOCAL_FALLBACK_NAMESPACE),
        ...template,
        ownerId: user.uid,
        created_at: toClientTimestamp() as any,
      });
      return { id: localId };
    }
  },

  updateTemplate: async (id: string, template: Partial<MessageTemplate>) => {
    const user = await waitForCurrentUser();
    if (!user) throw new Error('Must be logged in to update template');
    try {
      if (localFallbackStore.isLocalId(id, LOCAL_FALLBACK_NAMESPACE)) {
        localFallbackStore.updateRecord<LocalMessageTemplate>(LOCAL_FALLBACK_NAMESPACE, user.uid, id, {
          ...template,
          _local_deleted: false,
        });
        return;
      }

      const templateRef = doc(db, COLLECTION_NAME, id);
      await updateDoc(templateRef, template);
    } catch (error) {
      console.error('Primary message template update failed, updating local fallback instead:', error);
      const cachedTemplate = templateCache.get(id);
      localFallbackStore.upsertRecord<LocalMessageTemplate>(LOCAL_FALLBACK_NAMESPACE, user.uid, {
        ...(cachedTemplate || {
          id,
          ownerId: user.uid,
          name: template.name || '',
          content: template.content || '',
          created_at: toClientTimestamp() as any,
        }),
        ...template,
        _local_deleted: false,
      } as LocalMessageTemplate);
    }
  },

  deleteTemplate: async (id: string) => {
    const user = await waitForCurrentUser();
    if (!user) throw new Error('Must be logged in to delete template');
    try {
      if (localFallbackStore.isLocalId(id, LOCAL_FALLBACK_NAMESPACE)) {
        localFallbackStore.removeRecord<LocalMessageTemplate>(LOCAL_FALLBACK_NAMESPACE, user.uid, id);
        templateCache.delete(id);
        return;
      }

      const templateRef = doc(db, COLLECTION_NAME, id);
      await deleteDoc(templateRef);
    } catch (error) {
      console.error('Primary message template delete failed, hiding it locally instead:', error);
      const cachedTemplate = templateCache.get(id);
      localFallbackStore.upsertRecord<LocalMessageTemplate>(LOCAL_FALLBACK_NAMESPACE, user.uid, {
        ...(cachedTemplate || {
          id,
          ownerId: user.uid,
          name: '',
          content: '',
          created_at: toClientTimestamp() as any,
        }),
        _local_deleted: true,
      } as LocalMessageTemplate);
    }
  }
};
