import { generateObject } from "ai";
import type { z } from "zod";

import { GLOW_PARSE_MODEL } from "@/lib/ai/model";
import {
  extractPdfText,
  formatDocumentParseError,
} from "@/lib/documents/upload";

type ImageMediaType = "image/png" | "image/jpeg" | "image/webp";

export async function generateObjectFromDocument<T>({
  schema,
  prompt,
  buffer,
  mediaType,
  kind,
}: {
  schema: z.ZodType<T>;
  prompt: string;
  buffer: Buffer;
  mediaType: string;
  kind: "image" | "pdf";
}): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    if (kind === "pdf") {
      const extracted = await extractPdfText(buffer);
      if (!extracted.ok) return extracted;

      const { object } = await generateObject({
        model: GLOW_PARSE_MODEL,
        schema,
        prompt: `${prompt}\n\n---\nDOCUMENT TEXT:\n${extracted.text}`,
      });

      return { ok: true, data: object };
    }

    const { object } = await generateObject({
      model: GLOW_PARSE_MODEL,
      schema,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "image",
              image: buffer,
              mediaType: mediaType as ImageMediaType,
            },
          ],
        },
      ],
    });

    return { ok: true, data: object };
  } catch (err) {
    return { ok: false, error: formatDocumentParseError(err) };
  }
}
