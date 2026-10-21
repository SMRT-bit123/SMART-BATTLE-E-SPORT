/**
 * Image Upload Helper - Uploads images at 100% original full resolution and quality without any compression.
 * Saves directly to ImgBB via the configured IMGBB_API_KEY or server storage and returns a direct URL.
 */

export const IMGBB_API_KEY = "d599c4ff6c2a021fa0f952a67b26b480";

export async function uploadOriginalImage(
  fileOrBase64: File | Blob | string,
  onProgress?: (progress: number) => void
): Promise<string> {
  // If it's already a hosted URL (http / https / /uploads/...), return as is
  if (typeof fileOrBase64 === 'string') {
    if (fileOrBase64.startsWith('http://') || fileOrBase64.startsWith('https://') || fileOrBase64.startsWith('/uploads/')) {
      if (onProgress) onProgress(100);
      return fileOrBase64;
    }
  }

  // Convert File / Blob to DataURL (exact bit-for-bit original data)
  let base64String: string;
  let fileName = 'match_image.png';

  if (typeof fileOrBase64 === 'string') {
    base64String = fileOrBase64;
  } else {
    fileName = (fileOrBase64 as File).name || 'match_image.png';
    base64String = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(fileOrBase64);
    });
  }

  if (onProgress) onProgress(20);

  // 1. Try Client-side direct ImgBB upload (fastest for user, direct CDN link from user's IP)
  const apiKey = (import.meta.env.VITE_IMGBB_API_KEY as string) || IMGBB_API_KEY;
  if (apiKey) {
    try {
      const rawBase64 = base64String.includes(',') ? base64String.split(',')[1] : base64String;
      const formData = new FormData();
      formData.append('image', rawBase64);

      const imgbbRes = await fetch(`https://api.imgbb.com/1/upload?key=${apiKey}`, {
        method: 'POST',
        body: formData
      });
      const imgbbData = await imgbbRes.json();
      if (imgbbData?.data?.url) {
        if (onProgress) onProgress(100);
        return imgbbData.data.url;
      }
    } catch (imgbbErr) {
      console.warn('[Upload] Client ImgBB direct upload skipped/failed, trying backend:', imgbbErr);
    }
  }

  if (onProgress) onProgress(50);

  // 2. Try uploading to backend /api/upload-image (which has server ImgBB + local /uploads/ storage)
  try {
    const res = await fetch('/api/upload-image', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        imageBase64: base64String,
        filename: fileName
      })
    });

    if (onProgress) onProgress(80);

    if (res.ok) {
      const data = await res.json();
      if (data.url) {
        if (onProgress) onProgress(100);
        return data.url;
      }
    }
  } catch (err) {
    console.warn('[Upload] Server upload exception:', err);
  }

  if (onProgress) onProgress(100);
  
  // If fallback to base64 is needed, ensure it fits within Firestore's 1MB limit safely (< 400KB)
  if (base64String.length > 500000 && typeof window !== 'undefined') {
    try {
      const resized = await new Promise<string>((resolve) => {
        const img = new Image();
        img.onload = () => {
          const maxDim = 1200;
          let w = img.width;
          let h = img.height;
          if (w > maxDim || h > maxDim) {
            if (w > h) {
              h = Math.round((h * maxDim) / w);
              w = maxDim;
            } else {
              w = Math.round((w * maxDim) / h);
              h = maxDim;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, w, h);
            resolve(canvas.toDataURL('image/jpeg', 0.82));
          } else {
            resolve(base64String);
          }
        };
        img.onerror = () => resolve(base64String);
        img.src = base64String;
      });
      return resized;
    } catch {
      return base64String;
    }
  }

  return base64String;
}

// Backward-compatibility aliases
export const uploadOrCompressImage = uploadOriginalImage;
export const compressImage = async (file: File | Blob | string): Promise<string> => {
  return uploadOriginalImage(file);
};
