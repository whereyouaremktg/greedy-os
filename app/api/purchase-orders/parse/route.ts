import { createClient } from "@/lib/supabase/server";
import { parsePurchaseOrderDocument } from "@/lib/purchase-orders/parse";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
]);

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ ok: false, error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return Response.json(
      { ok: false, error: "Missing file upload" },
      { status: 400 },
    );
  }

  const mediaType = file.type || "application/octet-stream";
  if (!ALLOWED_TYPES.has(mediaType)) {
    return Response.json(
      {
        ok: false,
        error: "Unsupported file type. Upload a PNG, JPEG, or WebP image.",
      },
      { status: 400 },
    );
  }

  if (file.size > MAX_BYTES) {
    return Response.json(
      { ok: false, error: "File too large (max 10 MB)" },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await parsePurchaseOrderDocument(buffer, mediaType);

  if (!result.ok) {
    return Response.json({ ok: false, error: result.error }, { status: 422 });
  }

  return Response.json({ ok: true, data: result.data });
}
