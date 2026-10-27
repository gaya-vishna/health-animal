/**
 * Compresses an image file/Blob client-side using HTML5 Canvas
 * Max width: 900px, Quality: 0.8 JPEG
 *
 * Decodes straight from the file (no giant base64 string in memory first) so large
 * phone photos and gallery pictures don't freeze the page.
 */
export async function compressImageToCanvasBase64(fileOrBlob, maxWidth = 900, quality = 0.8) {
  const bitmap = await decode(fileOrBlob);
  const scale = Math.min(1, maxWidth / bitmap.width);
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  return canvas.toDataURL('image/jpeg', quality);
}

// createImageBitmap honours EXIF rotation and decodes off the main thread; fall back to <img>.
async function decode(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      /* fall through */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Could not read the image'));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
