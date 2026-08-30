"use client";

import { useEffect } from "react";
import {
  APIProvider,
  Map,
  Marker,
  useMap,
} from "@vis.gl/react-google-maps";
import type { MapPoint } from "./types";

function RouteLine({ points }: { points: MapPoint[] }) {
  const map = useMap();

  useEffect(() => {
    if (!map || points.length < 2) return;
    const line = new google.maps.Polyline({
      path: points.map((p) => ({ lat: p.lat, lng: p.lng })),
      strokeColor: "#1a6fe0",
      strokeOpacity: 0.8,
      strokeWeight: 3,
    });
    line.setMap(map);
    return () => line.setMap(null);
  }, [map, points]);

  return null;
}

function FitBounds({ points }: { points: MapPoint[] }) {
  const map = useMap();

  useEffect(() => {
    if (!map || points.length === 0) return;
    if (points.length === 1) {
      map.setCenter({ lat: points[0].lat, lng: points[0].lng });
      map.setZoom(14);
      return;
    }
    const bounds = new google.maps.LatLngBounds();
    points.forEach((p) => bounds.extend({ lat: p.lat, lng: p.lng }));
    map.fitBounds(bounds, 48);
  }, [map, points]);

  return null;
}

export function GoogleMapView({
  apiKey,
  points,
  route,
  onSelect,
}: {
  apiKey: string;
  points: MapPoint[];
  route?: boolean;
  onSelect?: (id: string) => void;
}) {
  const center = points[0]
    ? { lat: points[0].lat, lng: points[0].lng }
    : { lat: 36.1627, lng: -86.7816 };

  return (
    <APIProvider apiKey={apiKey}>
      <Map
        defaultCenter={center}
        defaultZoom={11}
        gestureHandling="greedy"
        disableDefaultUI={false}
        mapTypeControl={false}
        streetViewControl={false}
        fullscreenControl={false}
        className="size-full"
      >
        {points.map((p) => (
          <Marker
            key={p.id}
            position={{ lat: p.lat, lng: p.lng }}
            title={p.title}
            label={
              p.index
                ? { text: String(p.index), color: "#ffffff", fontSize: "11px" }
                : undefined
            }
            onClick={() => onSelect?.(p.id)}
          />
        ))}
        <FitBounds points={points} />
        {route && <RouteLine points={points} />}
      </Map>
    </APIProvider>
  );
}
