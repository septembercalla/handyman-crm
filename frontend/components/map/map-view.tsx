"use client";

import { GoogleMapView } from "./google-map";
import { SchematicMap } from "./schematic-map";
import type { MapPoint } from "./types";
import { cn } from "@/lib/utils";

const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

/**
 * Single entry point for maps.
 * With a key — real Google Maps; without one — the schematic (see SchematicMap).
 */
export function MapView({
  points,
  route = false,
  className,
  onSelect,
  selectedId,
}: {
  points: MapPoint[];
  route?: boolean;
  className?: string;
  onSelect?: (id: string) => void;
  selectedId?: string | null;
}) {
  if (API_KEY) {
    return (
      <div
        className={cn(
          "overflow-hidden rounded-[4px] border border-line",
          className,
        )}
      >
        <GoogleMapView
          apiKey={API_KEY}
          points={points}
          route={route}
          onSelect={onSelect}
        />
      </div>
    );
  }

  return (
    <SchematicMap
      points={points}
      route={route}
      className={className}
      onSelect={onSelect}
      selectedId={selectedId}
    />
  );
}

export type { MapPoint };
