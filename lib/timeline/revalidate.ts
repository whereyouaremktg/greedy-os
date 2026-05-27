import { revalidatePath } from "next/cache";

/** Invalidate server-rendered views that read timeline event sources. */
export function revalidateTimelinePaths() {
  revalidatePath("/timeline");
  revalidatePath("/dashboard");
  revalidatePath("/manufacturing");
  revalidatePath("/purchase-orders");
  revalidatePath("/campaigns");
}
