import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { savePipelineService } from './savePipelineService';

const cloudBackedLocalIdCache = new Map<string, boolean>();

const buildCacheKey = (collectionName: string, id: string) => `${collectionName}:${id}`;

export const cloudBackedLocalIdService = {
  markCloudBacked: (collectionName: string, id: string) => {
    cloudBackedLocalIdCache.set(buildCacheKey(collectionName, id), true);
  },

  clear: () => {
    cloudBackedLocalIdCache.clear();
  },

  hasCloudCopy: async (
    collectionName: string,
    id: string,
    timeoutMessage = 'Timed out while checking the recovered cloud record.'
  ) => {
    const cacheKey = buildCacheKey(collectionName, id);
    if (cloudBackedLocalIdCache.has(cacheKey)) {
      return cloudBackedLocalIdCache.get(cacheKey) === true;
    }

    const snapshot = await savePipelineService.withTimeout(getDoc(doc(db, collectionName, id)), {
      timeoutMessage,
    });
    const exists = snapshot.exists();
    cloudBackedLocalIdCache.set(cacheKey, exists);
    return exists;
  },

  shouldUseLocalFallback: async (
    collectionName: string,
    id: string,
    timeoutMessage = 'Timed out while checking whether the record was recovered to Firestore.'
  ) => {
    if (!id.startsWith('local:')) return false;
    return !(await cloudBackedLocalIdService.hasCloudCopy(collectionName, id, timeoutMessage));
  },
};
