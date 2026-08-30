"use client";

import { useMemo } from "react";
import type { MapPoint, MapRoute } from "./types";
import { cn } from "@/lib/utils";

/**
 * Fallback map: plots points from coordinates without Google Maps.
 * Shown while NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is unset, so the screen
 * is meaningful right after `npm run dev`.
 */
export function SchematicMap({
  points,
  route = false,
  routes = [],
  className,
  onSelect,
  selectedId,
}: {
  points: MapPoint[];
  route?: boolean;
  routes?: MapRoute[];
  className?: string;
  onSelect?: (id: string) => void;
  selectedId?: string | null;
}) {
  const layout = useMemo(() => {
    const pts = points.filter(
      (p) => Number.isFinite(p.lat) && Number.isFinite(p.lng),
    );
    if (pts.length === 0) return null;

    const lats = pts.map((p) => p.lat);
    const lngs = pts.map((p) => p.lng);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);

    // guard against a degenerate box (single point / straight line)
    const spanLat = Math.max(maxLat - minLat, 0.01);
    const spanLng = Math.max(maxLng - minLng, 0.01);
    const cLat = (minLat + maxLat) / 2;
    const cLng = (minLng + maxLng) / 2;

    const pad = 12;
    const W = 100;
    const H = 100;

    return pts.map((p) => ({
      ...p,
      x: pad + ((p.lng - (cLng - spanLng / 2)) / spanLng) * (W - pad * 2),
      // latitude grows upwards, screen coordinates downwards
      y: pad + (((cLat + spanLat / 2) - p.lat) / spanLat) * (H - pad * 2),
    }));
  }, [points]);

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[4px] border border-line bg-[#eef1f4]",
        className,
      )}
    >
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 size-full"
        aria-hidden
      >
        <defs>
          <pattern
            id="grid"
            width="6.25"
            height="6.25"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 6.25 0 L 0 0 0 6.25"
              fill="none"
              stroke="#dfe4e9"
              strokeWidth="0.3"
            />
          </pattern>
        </defs>
        <rect width="100" height="100" fill="url(#grid)" />
        {route && layout && layout.length > 1 && (
          <polyline
            points={layout.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke="#1a6fe0"
            strokeWidth="0.7"
            strokeLinejoin="round"
            strokeLinecap="round"
            opacity="0.75"
          />
        )}
        {layout &&
          routes.map((mapRoute) => {
            const routePoints = mapRoute.points
              .map((point) => layout.find((item) => item.id === point.id))
              .filter((point) => point !== undefined);
            return routePoints.length > 1 ? (
              <polyline
                key={mapRoute.id}
                points={routePoints.map((point) => `${point.x},${point.y}`).join(" ")}
                fill="none"
                stroke={mapRoute.color}
                strokeWidth="0.8"
                strokeLinejoin="round"
                strokeLinecap="round"
                opacity="0.8"
              />
            ) : null;
          })}
      </svg>

      {layout?.map((p) => {
        const selected = selectedId === p.id;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onSelect?.(p.id)}
            title={`${p.title}${p.subtitle ? " — " + p.subtitle : ""}`}
            style={{
              left: `${p.x}%`,
              top: `${p.y}%`,
              backgroundColor: p.neutral ? "#6b7785" : (p.color ?? "#1a6fe0"),
            }}
            className={cn(
              "absolute flex size-[22px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white text-[10px] font-bold text-white shadow-[0_1px_4px_rgba(27,39,51,0.35)] transition-transform",
              selected && "scale-125 ring-2 ring-brand ring-offset-1",
              onSelect && "cursor-pointer hover:scale-110",
            )}
          >
            {p.index ?? ""}
          </button>
        );
      })}

      {(!layout || layout.length === 0) && (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-[12px] text-ink-muted">No points with coordinates</p>
        </div>
      )}

      <span className="absolute bottom-1.5 right-2 rounded-[3px] bg-white/85 px-1.5 py-0.5 text-[10px] text-ink-muted">
        schematic · no Google Maps API key
      </span>
    </div>
  );
}
