import { getDownloadURL, ref, uploadString } from 'firebase/storage';
import { storage } from '../firebase';
import { SaveDebugContext, savePipelineService } from './savePipelineService';

const DATA_URL_PREFIX = 'data:image/';
const DEFAULT_INLINE_FALLBACK_LIMIT_BYTES = 450 * 1024;
const DEFAULT_UPLOAD_TIMEOUT_MS = 20000;

const createUniqueId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const getContentTypeFromDataUrl = (dataUrl: string) => {
  const match = dataUrl.match(/^data:([^;]+);base64,/i);
  return match?.[1] || 'image/jpeg';
};

const getExtensionFromContentType = (contentType: string) => {
  if (contentType.includes('webp')) return 'webp';
  if (contentType.includes('png')) return 'png';
  if (contentType.includes('gif')) return 'gif';
  return 'jpg';
};

const normalizeFolder = (folder: string) => folder.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
const estimateDataUrlBytes = (dataUrl: string) => {
  const base64Payload = dataUrl.split(',')[1] || '';
  return Math.ceil((base64Payload.length * 3) / 4);
};

export const mediaUploadService = {
  isDataUrl: (value?: string | null) => typeof value === 'string' && value.startsWith(DATA_URL_PREFIX),

  uploadImageDataUrl: async ({
    ownerId,
    folder,
    dataUrl,
    contentType,
    fileNamePrefix = 'image',
    allowInlineFallback = false,
    maxInlineFallbackBytes = DEFAULT_INLINE_FALLBACK_LIMIT_BYTES,
    debugContext,
  }: {
    ownerId: string;
    folder: string;
    dataUrl: string;
    contentType?: string;
    fileNamePrefix?: string;
    allowInlineFallback?: boolean;
    maxInlineFallbackBytes?: number;
    debugContext?: SaveDebugContext;
  }) => {
    if (!mediaUploadService.isDataUrl(dataUrl)) {
      return {
        downloadUrl: dataUrl,
        storagePath: '',
        contentType: contentType || '',
        source: 'passthrough' as const,
      };
    }

    const resolvedContentType = contentType || getContentTypeFromDataUrl(dataUrl);
    const extension = getExtensionFromContentType(resolvedContentType);
    const storagePath = `uploads/${ownerId}/${normalizeFolder(folder)}/${fileNamePrefix}-${createUniqueId()}.${extension}`;

    try {
      const storageRef = ref(storage, storagePath);
      if (debugContext) {
        savePipelineService.log(debugContext, 'storage_upload_attempted', { storagePath });
      }
      await savePipelineService.withTimeout(
        uploadString(storageRef, dataUrl, 'data_url', {
          contentType: resolvedContentType,
          cacheControl: 'public,max-age=31536000',
        }),
        {
          timeoutMs: DEFAULT_UPLOAD_TIMEOUT_MS,
          timeoutMessage: `Image upload timed out for ${storagePath}.`,
          debugContext,
        }
      );
      const downloadUrl = await savePipelineService.withTimeout(getDownloadURL(storageRef), {
        timeoutMs: DEFAULT_UPLOAD_TIMEOUT_MS,
        timeoutMessage: `Image URL retrieval timed out for ${storagePath}.`,
        debugContext,
      });

      if (debugContext) {
        savePipelineService.log(debugContext, 'storage_upload_succeeded', { storagePath });
      }

      return {
        downloadUrl,
        storagePath,
        contentType: resolvedContentType,
        source: 'storage' as const,
      };
    } catch (error) {
      if (debugContext) {
        savePipelineService.logError(debugContext, 'storage_upload_failed', error);
      }
      const estimatedBytes = estimateDataUrlBytes(dataUrl);
      if (allowInlineFallback && estimatedBytes <= maxInlineFallbackBytes) {
        console.warn('Error uploading image to Firebase Storage, using inline fallback:', error);
        return {
          downloadUrl: dataUrl,
          storagePath: '',
          contentType: resolvedContentType,
          source: 'inline_fallback' as const,
        };
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Unable to upload image for ${storagePath}: ${errorMessage}`);
    }
  },

  uploadImageDataUrls: async ({
    ownerId,
    folder,
    dataUrls,
    contentType,
    fileNamePrefix = 'image',
    allowInlineFallback = false,
    maxInlineFallbackBytes = DEFAULT_INLINE_FALLBACK_LIMIT_BYTES,
    debugContext,
  }: {
    ownerId: string;
    folder: string;
    dataUrls: string[];
    contentType?: string;
    fileNamePrefix?: string;
    allowInlineFallback?: boolean;
    maxInlineFallbackBytes?: number;
    debugContext?: SaveDebugContext;
  }) => {
    return Promise.all(
      (dataUrls || []).map((dataUrl, index) =>
        mediaUploadService.uploadImageDataUrl({
          ownerId,
          folder,
          dataUrl,
          contentType,
          fileNamePrefix: `${fileNamePrefix}-${index + 1}`,
          allowInlineFallback,
          maxInlineFallbackBytes,
          debugContext,
        })
      )
    );
  },
};
