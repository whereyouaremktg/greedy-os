import { TargetsView } from "@/components/targets/targets-view";
import { createClient } from "@/lib/supabase/server";
import { getTargetsData } from "@/lib/targets/queries";

export const dynamic = "force-dynamic";
// The manual Refresh server action runs the Shopify sync inline.
export const maxDuration = 120;

export default async function TargetsPage() {
  const supabase = await createClient();
  const data = await getTargetsData(supabase);
  return <TargetsView data={data} />;
}
