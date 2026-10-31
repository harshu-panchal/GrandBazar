const DEFAULT_MAX_DIMENSION = 1600;
const DEFAULT_TARGET_BYTES = 1_200_000;
const JPEG_QUALITY_STEPS = [0.8, 0.68, 0.58];

function canvasToBlob(canvas, mimeType, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Could not optimize the selected image"));
      },
      mimeType,
      quality,
    );
  });
}

async function decodeImage(file) {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        cleanup: () => bitmap.close?.(),
      };
    } catch {
      // Older Safari versions do not support imageOrientation on
      // createImageBitmap. The HTMLImageElement path below still works.
    }
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error("The selected image could not be read"));
      image.src = objectUrl;
    });
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      cleanup: () => URL.revokeObjectURL(objectUrl),
    };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

/**
 * Resize camera photos before uploading proof images. A typical 8-20 MB phone
 * photo becomes roughly 300 KB-1.2 MB while retaining enough detail for
 * operational handover evidence.
 */
export async function optimizeProofImage(
  file,
  {
    maxDimension = DEFAULT_MAX_DIMENSION,
    targetBytes = DEFAULT_TARGET_BYTES,
  } = {},
) {
  if (!(file instanceof Blob) || !String(file.type || "").startsWith("image/")) {
    throw new Error("Please select a valid image file");
  }

  // Small files already upload quickly and do not need a decode/re-encode pass.
  if (file.size <= targetBytes) return file;

  const decoded = await decodeImage(file);
  try {
    const scale = Math.min(1, maxDimension / Math.max(decoded.width, decoded.height));
    const width = Math.max(1, Math.round(decoded.width * scale));
    const height = Math.max(1, Math.round(decoded.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Image optimization is not supported on this device");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(decoded.source, 0, 0, width, height);

    let optimized = null;
    for (const quality of JPEG_QUALITY_STEPS) {
      optimized = await canvasToBlob(canvas, "image/jpeg", quality);
      if (optimized.size <= targetBytes) break;
    }

    if (!optimized || optimized.size >= file.size) return file;

    const originalName = file.name || "handover-photo.jpg";
    const outputName = originalName.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([optimized], outputName, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } finally {
    decoded.cleanup();
  }
}

