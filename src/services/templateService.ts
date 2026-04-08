import { db, auth } from '../firebase';
import { collection, addDoc, onSnapshot, query, where, serverTimestamp, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { OperationType, handleFirestoreError } from './verificationService';

export interface MessageTemplate {
  id?: string;
  name: string;
  content: string;
  ownerId?: string;
  created_at?: any;
}

const COLLECTION_NAME = 'message_templates';

export interface ProofMessageContext {
  customerName?: string;
  serviceName?: string;
  price?: number | string;
  proofLink: string;
  paymentDue?: boolean;
}

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

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      unsubscribeSnapshot();

      if (!user) {
        callback([]);
        return;
      }

      const q = query(
        collection(db, COLLECTION_NAME),
        where('ownerId', '==', user.uid)
      );

      unsubscribeSnapshot = onSnapshot(q, (snapshot) => {
        const templates = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as MessageTemplate[];
        callback(templates);
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, COLLECTION_NAME);
      });
    });

    return () => {
      unsubscribeSnapshot();
      unsubscribeAuth();
    };
  },

  addTemplate: async (template: Omit<MessageTemplate, 'id' | 'ownerId' | 'created_at'>) => {
    const user = auth.currentUser;
    if (!user) throw new Error('Must be logged in to add template');

    const newTemplate = {
      ...template,
      ownerId: user.uid,
      created_at: serverTimestamp()
    };

    try {
      return await addDoc(collection(db, COLLECTION_NAME), newTemplate);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, COLLECTION_NAME);
    }
  },

  updateTemplate: async (id: string, template: Partial<MessageTemplate>) => {
    try {
      const templateRef = doc(db, COLLECTION_NAME, id);
      await updateDoc(templateRef, template);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, COLLECTION_NAME);
    }
  },

  deleteTemplate: async (id: string) => {
    try {
      const templateRef = doc(db, COLLECTION_NAME, id);
      await deleteDoc(templateRef);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, COLLECTION_NAME);
    }
  }
};
