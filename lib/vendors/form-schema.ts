import { z } from "zod";

// Shared vendor form schema. Kept out of the "use server" action file because
// those may only export async functions — exporting a zod object there throws
// "A 'use server' file can only export async functions" at runtime.

const optionalText = z
  .string()
  .max(2000)
  .transform((v) => {
    const trimmed = v.trim();
    return trimmed.length > 0 ? trimmed : null;
  });

const optionalEmail = z
  .string()
  .max(320)
  .transform((v) => v.trim())
  .pipe(
    z
      .union([z.literal(""), z.string().email("Invalid email")])
      .transform((v) => (v.length > 0 ? v : null)),
  );

export const vendorSchema = z.object({
  name: z
    .string()
    .max(200)
    .transform((v) => v.trim())
    .pipe(z.string().min(1, "Name is required")),
  contact_name: optionalText,
  email: optionalEmail,
  phone: optionalText,
  notes: optionalText,
});

export type VendorFormValues = z.input<typeof vendorSchema>;
