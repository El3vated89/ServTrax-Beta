import type { User } from 'firebase/auth';
import { auth } from '../firebase';
import { SaveDebugContext, savePipelineService } from './savePipelineService';

const DEFAULT_AUTH_WAIT_TIMEOUT_MS = 8000;
let lastResolvedUser: User | null = auth.currentUser;

export const rememberResolvedUser = (user: User | null) => {
  lastResolvedUser = user;
};

export const getResolvedCurrentUser = () => auth.currentUser || lastResolvedUser;

export const subscribeToResolvedUser = (callback: (user: User | null) => void) => {
  let lastDeliveredUid: string | null | undefined;

  const emit = (user: User | null) => {
    rememberResolvedUser(user);
    const nextUid = user?.uid || null;
    if (lastDeliveredUid === nextUid) return;
    lastDeliveredUid = nextUid;
    callback(user);
  };

  const currentUser = getResolvedCurrentUser();
  if (currentUser) {
    emit(currentUser);
  }

  return auth.onAuthStateChanged((user) => {
    emit(user);
  });
};

export const waitForCurrentUser = async ({
  timeoutMs = DEFAULT_AUTH_WAIT_TIMEOUT_MS,
  debugContext,
}: {
  timeoutMs?: number;
  debugContext?: SaveDebugContext;
} = {}): Promise<User | null> => {
  const resolvedUser = getResolvedCurrentUser();
  if (resolvedUser) {
    if (debugContext) {
      savePipelineService.log(debugContext, 'auth_wait_resolved', { userId: resolvedUser.uid });
    }
    return resolvedUser;
  }

  if (debugContext) {
    savePipelineService.log(debugContext, 'auth_wait_started');
  }

  return new Promise<User | null>((resolve, reject) => {
    let settled = false;
    let unsubscribe = () => {};

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      unsubscribe();
      const error = new Error('Authentication timed out while waiting for the current session.');
      if (debugContext) {
        savePipelineService.logError(debugContext, 'timeout', error);
      }
      reject(error);
    }, timeoutMs);

    unsubscribe = auth.onAuthStateChanged((user) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      unsubscribe();
      rememberResolvedUser(user);
      if (debugContext) {
        savePipelineService.log(debugContext, 'auth_wait_resolved', { userId: user?.uid || null });
      }
      resolve(user);
    });
  });
};
