import { db, auth } from '../firebase';
import { collection, addDoc, onSnapshot, query, where, serverTimestamp, updateDoc, doc, deleteDoc, getDocs } from 'firebase/firestore';

export interface ServicePlan {
  id?: string;
  ownerId?: string;
  name: string;
  description: string;
  price: number;
  billing_frequency: string;
  requires_photos?: boolean;
  seasonal_enabled?: boolean;
  seasonal_rules?: any[];
  created_at?: any;
}

const COLLECTION_NAME = 'service_plans';

export const servicePlanService = {
  subscribeToServicePlans: (callback: (plans: ServicePlan[]) => void) => {
    const user = auth.currentUser;
    if (!user) return () => {};

    const q = query(
      collection(db, COLLECTION_NAME),
      where('ownerId', '==', user.uid)
    );

    return onSnapshot(q, (snapshot) => {
      const plans = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as ServicePlan[];
      callback(plans);
    }, (error) => {
      console.error("Error fetching service plans:", error);
    });
  },

  addServicePlan: async (plan: Omit<ServicePlan, 'id' | 'ownerId' | 'created_at'>) => {
    const user = auth.currentUser;
    if (!user) throw new Error('Must be logged in to add service plan');

    const newPlan = {
      ...plan,
      ownerId: user.uid,
      created_at: serverTimestamp()
    };

    return await addDoc(collection(db, COLLECTION_NAME), newPlan);
  },

  updateServicePlan: async (id: string, updates: Partial<ServicePlan>) => {
    const docRef = doc(db, COLLECTION_NAME, id);
    return await updateDoc(docRef, updates);
  },

  deleteServicePlan: async (id: string) => {
    const docRef = doc(db, COLLECTION_NAME, id);
    return await deleteDoc(docRef);
  },

  initializeDefaultServices: async () => {
    const user = auth.currentUser;
    if (!user) return;

    const q = query(collection(db, COLLECTION_NAME), where('ownerId', '==', user.uid), where('name', '==', 'Lawn Service (basic)'));
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) {
      await addDoc(collection(db, COLLECTION_NAME), {
        name: 'Lawn Service (basic)',
        description: 'Basic lawn mowing service',
        price: 50,
        billing_frequency: 'bi_weekly',
        ownerId: user.uid,
        created_at: serverTimestamp()
      });
    }
  }
};
