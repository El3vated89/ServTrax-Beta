export type SaveDebugStage =
  | 'save_started'
  | 'validation_passed'
  | 'validation_failed'
  | 'service_called'
  | 'payload_built'
  | 'db_write_attempted'
  | 'db_write_succeeded'
  | 'db_write_failed'
  | 'fallback_write_attempted'
  | 'fallback_write_succeeded'
  | 'fallback_write_failed'
  | 'response_received'
  | 'ui_success_handler_fired'
  | 'loading_state_cleared'
  | 'storage_upload_attempted'
  | 'storage_upload_succeeded'
  | 'storage_upload_failed'
  | 'auth_wait_started'
  | 'auth_wait_resolved'
  | 'timeout';

export interface SaveDebugContext {
  flow: string;
  traceId: string;
}

interface SaveDebugEvent extends SaveDebugContext {
  stage: SaveDebugStage;
  detail?: string;
  level: 'info' | 'error';
  timestamp: string;
}

const DEBUG_STORAGE_KEY = 'servtrax:save-debug-events';
const MAX_DEBUG_EVENTS = 250;
const DEFAULT_TIMEOUT_MS = 15000;

const canUseSessionStorage = () =>
  typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined';

const toDetailString = (detail?: unknown) => {
  if (detail == null) return undefined;
  if (typeof detail === 'string') return detail;

  try {
    return JSON.stringify(detail);
  } catch (error) {
    return String(detail);
  }
};

const readEvents = (): SaveDebugEvent[] => {
  if (!canUseSessionStorage()) return [];

  try {
    const value = window.sessionStorage.getItem(DEBUG_STORAGE_KEY);
    const parsed = value ? JSON.parse(value) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('Failed to read save debug events:', error);
    return [];
  }
};

const writeEvents = (events: SaveDebugEvent[]) => {
  if (!canUseSessionStorage()) return;

  try {
    window.sessionStorage.setItem(DEBUG_STORAGE_KEY, JSON.stringify(events.slice(-MAX_DEBUG_EVENTS)));
  } catch (error) {
    console.error('Failed to write save debug events:', error);
  }
};

const pushEvent = (event: SaveDebugEvent) => {
  const nextEvents = [...readEvents(), event];
  writeEvents(nextEvents);

  if (event.level === 'error') {
    console.error('[SaveDebug]', event);
    return;
  }

  console.info('[SaveDebug]', event);
};

export const savePipelineService = {
  createTraceId: (flow: string) =>
    `${flow}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,

  log: (context: SaveDebugContext, stage: SaveDebugStage, detail?: unknown) => {
    pushEvent({
      ...context,
      stage,
      detail: toDetailString(detail),
      level: 'info',
      timestamp: new Date().toISOString(),
    });
  },

  logError: (context: SaveDebugContext, stage: SaveDebugStage, error: unknown) => {
    pushEvent({
      ...context,
      stage,
      detail: error instanceof Error ? error.message : String(error),
      level: 'error',
      timestamp: new Date().toISOString(),
    });
  },

  getEvents: () => readEvents(),

  clearEvents: () => writeEvents([]),

  withTimeout: async <T>(
    promise: Promise<T>,
    {
      timeoutMs = DEFAULT_TIMEOUT_MS,
      timeoutMessage = 'Save request timed out.',
      debugContext,
    }: {
      timeoutMs?: number;
      timeoutMessage?: string;
      debugContext?: SaveDebugContext;
    } = {}
  ) => {
    return new Promise<T>((resolve, reject) => {
      let settled = false;

      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;

        const error = new Error(timeoutMessage);
        if (debugContext) {
          savePipelineService.logError(debugContext, 'timeout', error);
        }

        reject(error);
      }, timeoutMs);

      Promise.resolve(promise)
        .then((value) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          resolve(value);
        })
        .catch((error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          reject(error);
        });
    });
  },
};
