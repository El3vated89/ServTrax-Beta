const LOCAL_FALLBACK_EVENT = 'servtrax-local-fallback-updated';
const LOCAL_RUNTIME_WRITE_ERROR =
  'Local browser fallback writes are disabled. The shared database is the only live source of truth.';

const canUseLocalStorage = () =>
  typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

const buildStorageKey = (namespace: string, ownerId: string) =>
  `servtrax:fallback:${namespace}:${ownerId}`;

const persistRecords = <T>(namespace: string, ownerId: string, records: T[]) => {
  if (!canUseLocalStorage()) return;
  window.localStorage.setItem(buildStorageKey(namespace, ownerId), JSON.stringify(records));
  emitLocalFallbackUpdate(namespace, ownerId);
};

const emitLocalFallbackUpdate = (namespace: string, ownerId: string) => {
  if (typeof window === 'undefined') return;

  window.dispatchEvent(
    new CustomEvent(LOCAL_FALLBACK_EVENT, {
      detail: { namespace, ownerId },
    })
  );
};

const safeParse = <T>(value: string | null): T[] => {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch (error) {
    console.error('Failed to parse local fallback store payload:', error);
    return [];
  }
};

const createLocalId = (namespace: string) =>
  `local:${namespace}:${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

export const localFallbackStore = {
  createLocalId,

  isLocalId: (value: string | undefined, namespace?: string) => {
    if (!value) return false;
    return namespace ? value.startsWith(`local:${namespace}:`) : value.startsWith('local:');
  },

  readRecords: <T>(namespace: string, ownerId: string): T[] => {
    if (!canUseLocalStorage()) return [];
    return safeParse<T>(window.localStorage.getItem(buildStorageKey(namespace, ownerId)));
  },

  writeRecords: <T>(namespace: string, ownerId: string, records: T[]) => {
    persistRecords(namespace, ownerId, records);
  },

  upsertRecord: <T extends { id?: string }>(
    namespace: string,
    ownerId: string,
    record: T
  ) => {
    throw new Error(LOCAL_RUNTIME_WRITE_ERROR);
  },

  updateRecord: <T extends { id?: string }>(
    namespace: string,
    ownerId: string,
    recordId: string,
    updates: Partial<T>
  ) => {
    throw new Error(LOCAL_RUNTIME_WRITE_ERROR);
  },

  removeRecord: <T extends { id?: string }>(namespace: string, ownerId: string, recordId: string) => {
    const existingRecords = localFallbackStore.readRecords<T>(namespace, ownerId);
    const nextRecords = existingRecords.filter((entry) => entry.id !== recordId);
    persistRecords(namespace, ownerId, nextRecords);
  },

  subscribeToRecords: <T>(namespace: string, ownerId: string, callback: (records: T[]) => void) => {
    callback([]);
    return () => {};
  },
};
