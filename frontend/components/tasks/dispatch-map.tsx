"use client";

import { AlertTriangle, ExternalLink, MapPinned, Route } from "lucide-react";
import { MapView, type MapPoint, type MapRoute } from "@/components/map/map-view";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { clockTime, fullAddress, timeWindow } from "@/lib/format";
import type {
  ScheduleRow,
  ScheduleTravel,
  TaskWithRelations,
  TravelLeg,
} from "@/lib/types";

function routePoint(task: TaskWithRelations, index: number, color: string): MapPoint {
  return {
    id: task.id,
    lat: task.latitude!,
    lng: task.longitude!,
    index,
    color,
    title: `${index}. ${task.task_number} · ${task.title}`,
    subtitle: timeWindow(task.time_window_start, task.time_window_end),
  };
}

function googleMapsUrl(task: TaskWithRelations): string {
  const query =
    task.latitude !== null && task.longitude !== null
      ? `${task.latitude},${task.longitude}`
      : fullAddress(task);
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function DispatchMap({
  rows,
  unassigned,
  travel,
  travelLoading,
  travelError,
  selectedTaskId,
  onSelectTask,
}: {
  rows: ScheduleRow[];
  unassigned: TaskWithRelations[];
  travel?: ScheduleTravel;
  travelLoading: boolean;
  travelError: boolean;
  selectedTaskId: string | null;
  onSelectTask: (id: string) => void;
}) {
  const assignedTasks = rows.flatMap((row) => row.tasks);
  const allTasks = [...assignedTasks, ...unassigned];
  const points: MapPoint[] = [];
  const routes: MapRoute[] = [];

  for (const row of rows) {
    const ordered = [...row.tasks].sort((a, b) =>
      (a.time_window_start ?? "99:99").localeCompare(b.time_window_start ?? "99:99"),
    );
    const routePoints = ordered
      .map((task, index) =>
        task.latitude !== null && task.longitude !== null
          ? routePoint(task, index + 1, row.handyman.color)
          : null,
      )
      .filter((point): point is MapPoint => point !== null);
    points.push(...routePoints);
    if (routePoints.length > 1) {
      routes.push({
        id: row.handyman.id,
        color: row.handyman.color,
        points: routePoints,
        encodedPolylines: travel?.legs
          .filter(
            (leg) => leg.handyman_id === row.handyman.id && leg.encoded_polyline,
          )
          .map((leg) => leg.encoded_polyline!),
      });
    }
  }

  const neutralPoints = unassigned
    .filter((task) => task.latitude !== null && task.longitude !== null)
    .map<MapPoint>((task) => ({
      id: task.id,
      lat: task.latitude!,
      lng: task.longitude!,
      color: "#6b7785",
      neutral: true,
      title: `${task.task_number} · ${task.title}`,
      subtitle: "Unassigned",
    }));
  points.push(...neutralPoints);

  const selectedTask = allTasks.find((task) => task.id === selectedTaskId) ?? null;
  const missingCoordinates = allTasks.filter(
    (task) => task.latitude === null || task.longitude === null,
  );
  const conflicts = travel?.legs.filter((leg) => leg.status === "conflict") ?? [];

  return (
    <div className="flex min-h-[520px] flex-col overflow-hidden rounded-[6px] border border-line bg-surface">
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-3 py-2">
        <p className="flex items-center gap-1.5 text-[12px] font-medium text-ink">
          <MapPinned className="size-4 text-brand" />
          Planned daily routes
        </p>
        <div className="ml-auto flex flex-wrap items-center gap-3 text-[11px] text-ink-muted">
          {rows.map((row) => (
            <span key={row.handyman.id} className="flex items-center gap-1">
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: row.handyman.color }}
              />
              {row.handyman.full_name}
            </span>
          ))}
          {unassigned.length > 0 && (
            <span className="flex items-center gap-1">
              <span className="size-2 rounded-full bg-[#6b7785]" /> Unassigned
            </span>
          )}
        </div>
      </div>

      {(missingCoordinates.length > 0 ||
        travelError ||
        (!travelLoading && Boolean(travel) && !travel?.routes_configured)) && (
        <div className="space-y-1 border-b border-line bg-[#fff8e8] px-3 py-2 text-[11px] text-[#7a4b00]">
          {missingCoordinates.length > 0 && (
            <p>
              {missingCoordinates.length} {missingCoordinates.length === 1 ? "job has" : "jobs have"} no coordinates and cannot be shown on the map.
            </p>
          )}
          {travelError && <p>Travel estimates are temporarily unavailable.</p>}
          {!travelLoading && travel && !travel.routes_configured && (
            <p>Routes API is not configured; showing planned stop order only.</p>
          )}
        </div>
      )}

      <div className="relative min-h-[390px] flex-1">
        <MapView
          points={points}
          routes={routes}
          selectedId={selectedTaskId}
          onSelect={onSelectTask}
          className="absolute inset-0 rounded-none border-0"
        />

        {selectedTask && (
          <div className="absolute bottom-3 left-3 right-3 z-10 rounded-[5px] border border-line bg-surface/95 p-3 shadow-[0_5px_20px_rgba(27,39,51,0.18)] backdrop-blur sm:right-auto sm:w-[340px]">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="tnum text-[11px] font-semibold text-brand">
                  {selectedTask.task_number}
                </p>
                <p className="truncate text-[13px] font-semibold text-ink">
                  {selectedTask.title}
                </p>
              </div>
              <StatusBadge status={selectedTask.status} />
            </div>
            <div className="mt-2 space-y-0.5 text-[11px] text-ink-muted">
              <p>{selectedTask.customer?.full_name ?? "No customer"}</p>
              <p className="truncate">{fullAddress(selectedTask)}</p>
              <p>
                {timeWindow(selectedTask.time_window_start, selectedTask.time_window_end)} · {selectedTask.handyman?.full_name ?? "Unassigned"}
              </p>
            </div>
            <Button asChild variant="link" size="sm" className="mt-2">
              <a href={googleMapsUrl(selectedTask)} target="_blank" rel="noreferrer">
                Open in Google Maps <ExternalLink />
              </a>
            </Button>
          </div>
        )}
      </div>

      <TravelSummary
        legs={travel?.legs ?? []}
        conflicts={conflicts}
        tasks={assignedTasks}
        loading={travelLoading}
        configured={travel?.routes_configured ?? false}
      />
    </div>
  );
}

function TravelSummary({
  legs,
  conflicts,
  tasks,
  loading,
  configured,
}: {
  legs: TravelLeg[];
  conflicts: TravelLeg[];
  tasks: TaskWithRelations[];
  loading: boolean;
  configured: boolean;
}) {
  if (loading) {
    return <p className="border-t border-line px-3 py-2 text-[11px] text-ink-muted">Calculating planned drive times…</p>;
  }
  if (!configured || legs.length === 0) return null;

  return (
    <div className="border-t border-line px-3 py-2">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-ink-muted">
        <Route className="size-3.5" />
        {legs.length} planned {legs.length === 1 ? "drive" : "drives"}
        <span className="ml-auto">Powered by Google</span>
      </div>
      {conflicts.map((leg) => {
        const previous = tasks.find((task) => task.id === leg.from_task_id);
        const next = tasks.find((task) => task.id === leg.to_task_id);
        return (
          <div
            key={`${leg.from_task_id}-${leg.to_task_id}`}
            className="mt-2 flex gap-2 rounded-[4px] border border-[#f0c36d] bg-[#fff8e8] p-2 text-[11px] text-[#7a4b00]"
          >
            <AlertTriangle className="size-3.5 shrink-0" />
            <p>
              <span className="font-semibold">{previous?.task_number} → {next?.task_number}:</span>{" "}
              {leg.drive_minutes} min drive · {leg.available_minutes} min available · likely {leg.conflict_minutes} min late
              {next?.time_window_start ? ` for ${clockTime(next.time_window_start)}` : ""}.
            </p>
          </div>
        );
      })}
    </div>
  );
}
