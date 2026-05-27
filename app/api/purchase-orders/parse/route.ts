import { createClient } from "@/lib/supabase/server";
import { readValidatedDocumentUpload } from "@/lib/documents/upload";
import { parsePurchaseOrderDocument } from "@/lib/purchase-orders/parse";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

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

  const read = await readValidatedDocumentUpload(file);
  if (!read.ok) {
    return Response.json({ ok: false, error: read.error }, { status: 400 });
  }

  const result = await parsePurchaseOrderDocument(
    read.buffer,
    read.mediaType,
    read.kind,
  );

  if (!result.ok) {
    return Response.json({ ok: false, error: result.error }, { status: 422 });
  }

  return Response.json({ ok: true, data: result.data });
}
