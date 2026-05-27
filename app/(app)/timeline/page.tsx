import { TimelineView } from "@/components/timeline/timeline-view";
import { fetchTimelineEvents } from "@/lib/timeline/fetch";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function TimelinePage() {
  const supabase = await createClient();
  const { events, error } = await fetchTimelineEvents(supabase);

  if (error) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Timeline</h1>
        <div className="rounded-md border border-destructive/50 bg-destructive/5 p-4 text-sm text-destructive">
          Failed to load timeline: {error}
        </div>
      </div>
    );
  }

  return <TimelineView events={events} />;
}
