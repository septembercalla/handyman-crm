import { Suspense } from "react";
import { WeeklyTrip } from "@/components/trips/weekly-trip";
export default function TripsPage() {
  return (
    <Suspense
      fallback={
        <div className="workspace-content text-sm text-ink-muted">
          Loading weekly trip…
        </div>
      }
    >
      <WeeklyTrip />
    </Suspense>
  );
}
