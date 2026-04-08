import type { User } from 'firebase/auth';
import { auth } from '../firebase';
import { SaveDebugContext, savePipelineService } from './savePipelineService';

const DEFAULT_AUTH_WAIT_TIMEOUT_MS = 8000;

export const waitForCurrentUser = async ({
  timeoutMs = DEFAULT_AUTH_WAIT_TIMEOUT_MS,
  debugContext,
}: {
  timeoutMs?: number;
  debugContext?: SaveDebugContext;
} = {}): Promise<User | null> => {
  if (auth.currentUser) {
    if (debugContext) {
      savePipelineService.log(debugContext, 'auth_wait_resolved', { userId: auth.currentUser.uid });
    }
    return auth.currentUser;
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
      if (debugContext) {
        savePipelineService.log(debugContext, 'auth_wait_resolved', { userId: user?.uid || null });
      }
      resolve(user);
    });
  });
};
