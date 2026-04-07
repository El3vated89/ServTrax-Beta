export interface CompressedImage {
  dataUrl: string;
  thumbnailUrl: string;
  size: number;
}

export const compressImage = async (file: File): Promise<CompressedImage> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }

        // Standard Image (Primary Proof) - Max width 1000px (reduced from 1600px to stay well within 1MB)
        let width = img.width;
        let height = img.height;
        const MAX_WIDTH = 1000;

        if (width > MAX_WIDTH) {
          height = Math.round((height * MAX_WIDTH) / width);
          width = MAX_WIDTH;
        }

        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);

        // Compress to WebP at 70% quality (reduced from 80%)
        const dataUrl = canvas.toDataURL('image/webp', 0.7);

        // Generate Thumbnail - Max width 400px
        const thumbCanvas = document.createElement('canvas');
        const thumbCtx = thumbCanvas.getContext('2d');
        if (!thumbCtx) {
          reject(new Error('Failed to get thumbnail canvas context'));
          return;
        }

        let thumbWidth = img.width;
        let thumbHeight = img.height;
        const THUMB_MAX_WIDTH = 400;

        if (thumbWidth > THUMB_MAX_WIDTH) {
          thumbHeight = Math.round((thumbHeight * THUMB_MAX_WIDTH) / thumbWidth);
          thumbWidth = THUMB_MAX_WIDTH;
        }

        thumbCanvas.width = thumbWidth;
        thumbCanvas.height = thumbHeight;
        thumbCtx.drawImage(img, 0, 0, thumbWidth, thumbHeight);

        // Compress thumbnail to WebP at 70% quality
        const thumbnailUrl = thumbCanvas.toDataURL('image/webp', 0.7);

        // Calculate approximate size in bytes of the base64 string
        // Base64 is ~33% larger than binary, so we adjust
        const sizeInBytes = Math.round((dataUrl.length * 3) / 4);

        resolve({
          dataUrl,
          thumbnailUrl,
          size: sizeInBytes
        });
      };
      img.onerror = (error) => reject(error);
    };
    reader.onerror = (error) => reject(error);
  });
};
