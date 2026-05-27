import { extractText, getDocumentProxy } from "unpdf";

export const DOCUMENT_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;

export const DOCUMENT_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
]);

export const DOCUMENT_PDF_TYPE = "application/pdf";

export const DOCUMENT_ACCEPT =
  "image/png,image/jpeg,image/webp,application/pdf";

export type ValidatedUploadFile =
  | { ok: true; buffer: Buffer; mediaType: string; kind: "image" | "pdf" }
  | { ok: false; error: string };

export async function readValidatedDocumentUpload(
  file: File,
): Promise<ValidatedUploadFile> {
  const mediaType = file.type || "application/octet-stream";

  const isImage = DOCUMENT_IMAGE_TYPES.has(mediaType);
  const isPdf = mediaType === DOCUMENT_PDF_TYPE;

  if (!isImage && !isPdf) {
    return {
      ok: false,
      error: "Unsupported file type. Upload a PDF or PNG/JPEG/WebP image.",
    };
  }

  if (file.size > DOCUMENT_UPLOAD_MAX_BYTES) {
    return {
      ok: false,
      error: "File too large (max 10 MB)",
    };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  return {
    ok: true,
    buffer,
    mediaType,
    kind: isPdf ? "pdf" : "image",
  };
}

/** @deprecated Use readValidatedDocumentUpload */
export async function readValidatedImageUpload(
  file: File,
): Promise<
  | { ok: true; buffer: Buffer; mediaType: string }
  | { ok: false; error: string }
> {
  const result = await readValidatedDocumentUpload(file);
  if (!result.ok) return result;
  if (result.kind === "pdf") {
    return {
      ok: false,
      error: "Unsupported file type. Upload a PNG, JPEG, or WebP image.",
    };
  }
  return { ok: true, buffer: result.buffer, mediaType: result.mediaType };
}

export async function extractPdfText(
  buffer: Buffer,
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  try {
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await extractText(pdf, { mergePages: true });

    const normalized = text.replace(/\s+/g, " ").trim();
    if (normalized.length < 40) {
      return {
        ok: false,
        error:
          "Could not read text from this PDF. Try a text-based PDF export, or upload a screenshot instead.",
      };
    }

    return { ok: true, text };
  } catch {
    return {
      ok: false,
      error: "Failed to read PDF. The file may be corrupted or password-protected.",
    };
  }
}

export function formatDocumentParseError(err: unknown): string {
  const message =
    err instanceof Error ? err.message : "Failed to parse document";

  if (message.includes("Free tier users do not have access")) {
    return "Document parsing model is not available on your AI Gateway plan. Add paid credits or set GLOW_PARSE_MODEL to a model your team can access (default: google/gemini-2.5-flash).";
  }

  return message;
}
