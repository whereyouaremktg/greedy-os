export const DOCUMENT_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;

export const DOCUMENT_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
]);

export type ValidatedUploadFile =
  | { ok: true; buffer: Buffer; mediaType: string }
  | { ok: false; error: string };

export async function readValidatedImageUpload(
  file: File,
): Promise<ValidatedUploadFile> {
  const mediaType = file.type || "application/octet-stream";
  if (!DOCUMENT_IMAGE_TYPES.has(mediaType)) {
    return {
      ok: false,
      error: "Unsupported file type. Upload a PNG, JPEG, or WebP image.",
    };
  }

  if (file.size > DOCUMENT_UPLOAD_MAX_BYTES) {
    return {
      ok: false,
      error: "File too large (max 10 MB)",
    };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  return { ok: true, buffer, mediaType };
}
