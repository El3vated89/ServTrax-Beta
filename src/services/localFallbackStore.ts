const LOCAL_FALLBACK_EVENT = 'servtrax-local-fallback-updated';

const canUseLocalStorage = () =>
  typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

const buildStorageKey = (namespace: string, ownerId: string) =>
  `servtrax:fallback:${namespace}:${ownerId}`;

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
    if (!canUseLocalStorage()) return;
    window.localStorage.setItem(buildStorageKey(namespace, ownerId), JSON.stringify(records));
    emitLocalFallbackUpdate(namespace, ownerId);
  },

  upsertRecord: <T extends { id?: string }>(
    namespace: string,
    ownerId: string,
    record: T
  ) => {
    const existingRecords = localFallbackStore.readRecords<T>(namespace, ownerId);
    const recordId = record.id || createLocalId(namespace);
    const nextRecords = [
      ...existingRecords.filter((entry) => entry.id !== recordId),
      { ...record, id: recordId },
    ];
    localFallbackStore.writeRecords(namespace, ownerId, nextRecords);
    return recordId;
  },

  updateRecord: <T extends { id?: string }>(
    namespace: string,
    ownerId: string,
    recordId: string,
    updates: Partial<T>
  ) => {
    const existingRecords = localFallbackStore.readRecords<T>(namespace, ownerId);
    const nextRecords = existingRecords.map((entry) =>
      entry.id === recordId ? ({ ...entry, ...updates } as T) : entry
    );
    localFallbackStore.writeRecords(namespace, ownerId, nextRecords);
  },

  removeRecord: <T extends { id?: string }>(namespace: string, ownerId: string, recordId: string) => {
    const existingRecords = localFallbackStore.readRecords<T>(namespace, ownerId);
    const nextRecords = existingRecords.filter((entry) => entry.id !== recordId);
    localFallbackStore.writeRecords(namespace, ownerId, nextRecords);
  },

  subscribeToRecords: <T>(namespace: string, ownerId: string, callback: (records: T[]) => void) => {
    if (!canUseLocalStorage()) {
      callback([]);
      return () => {};
    }

    const emit = () => {
      callback(localFallbackStore.readRecords<T>(namespace, ownerId));
    };

    const handleCustomEvent = (event: Event) => {
      const detail = (event as CustomEvent<{ namespace?: string; ownerId?: string }>).detail;
      if (!detail) return;
      if (detail.namespace !== namespace || detail.ownerId !== ownerId) return;
      emit();
    };

    const handleStorageEvent = (event: StorageEvent) => {
      if (event.key !== buildStorageKey(namespace, ownerId)) return;
      emit();
    };

    emit();
    window.addEventListener(LOCAL_FALLBACK_EVENT, handleCustomEvent as EventListener);
    window.addEventListener('storage', handleStorageEvent);

    return () => {
      window.removeEventListener(LOCAL_FALLBACK_EVENT, handleCustomEvent as EventListener);
      window.removeEventListener('storage', handleStorageEvent);
    };
  },
};
