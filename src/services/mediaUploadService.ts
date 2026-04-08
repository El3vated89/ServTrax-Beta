import { getDownloadURL, ref, uploadString } from 'firebase/storage';
import { storage } from '../firebase';

const DATA_URL_PREFIX = 'data:image/';

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

export const mediaUploadService = {
  isDataUrl: (value?: string | null) => typeof value === 'string' && value.startsWith(DATA_URL_PREFIX),

  uploadImageDataUrl: async ({
    ownerId,
    folder,
    dataUrl,
    contentType,
    fileNamePrefix = 'image',
  }: {
    ownerId: string;
    folder: string;
    dataUrl: string;
    contentType?: string;
    fileNamePrefix?: string;
  }) => {
    if (!mediaUploadService.isDataUrl(dataUrl)) {
      return {
        downloadUrl: dataUrl,
        storagePath: '',
        contentType: contentType || '',
      };
    }

    const resolvedContentType = contentType || getContentTypeFromDataUrl(dataUrl);
    const extension = getExtensionFromContentType(resolvedContentType);
    const storagePath = `uploads/${ownerId}/${normalizeFolder(folder)}/${fileNamePrefix}-${createUniqueId()}.${extension}`;

    try {
      const storageRef = ref(storage, storagePath);
      await uploadString(storageRef, dataUrl, 'data_url', {
        contentType: resolvedContentType,
        cacheControl: 'public,max-age=31536000',
      });
      const downloadUrl = await getDownloadURL(storageRef);

      return {
        downloadUrl,
        storagePath,
        contentType: resolvedContentType,
      };
    } catch (error) {
      console.error('Error uploading image to Firebase Storage, falling back to inline data URL:', error);
      return {
        downloadUrl: dataUrl,
        storagePath: '',
        contentType: resolvedContentType,
      };
    }
  },

  uploadImageDataUrls: async ({
    ownerId,
    folder,
    dataUrls,
    contentType,
    fileNamePrefix = 'image',
  }: {
    ownerId: string;
    folder: string;
    dataUrls: string[];
    contentType?: string;
    fileNamePrefix?: string;
  }) => {
    return Promise.all(
      (dataUrls || []).map((dataUrl, index) =>
        mediaUploadService.uploadImageDataUrl({
          ownerId,
          folder,
          dataUrl,
          contentType,
          fileNamePrefix: `${fileNamePrefix}-${index + 1}`,
        })
      )
    );
  },
};
