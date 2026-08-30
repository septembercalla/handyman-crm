"use client";

import { useEffect } from "react";
import {
  APIProvider,
  Map,
  Marker,
  useMap,
} from "@vis.gl/react-google-maps";
import type { MapPoint, MapRoute } from "./types";

function decodePolyline(encoded: string): google.maps.LatLngLiteral[] {
  const points: google.maps.LatLngLiteral[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    for (const coordinate of ["lat", "lng"] as const) {
      let result = 0;
      let shift = 0;
      let byte: number;
      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (coordinate === "lat") lat += delta;
      else lng += delta;
    }
    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
}

function RouteLine({ route }: { route: MapRoute }) {
  const map = useMap();

  useEffect(() => {
    if (!map || route.points.length < 2) return;
    const paths = route.encodedPolylines?.length
      ? route.encodedPolylines.map(decodePolyline)
      : [route.points.map((point) => ({ lat: point.lat, lng: point.lng }))];
    const lines = paths.map(
      (path) =>
        new google.maps.Polyline({
          path,
          map,
          strokeColor: route.color,
          strokeOpacity: 0.8,
          strokeWeight: 4,
        }),
    );
    return () => lines.forEach((line) => line.setMap(null));
  }, [map, route]);

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
  routes = [],
  onSelect,
  selectedId,
}: {
  apiKey: string;
  points: MapPoint[];
  route?: boolean;
  routes?: MapRoute[];
  onSelect?: (id: string) => void;
  selectedId?: string | null;
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
                : { text: "•", color: "#ffffff", fontSize: "13px" }
            }
            icon={{
              path: google.maps.SymbolPath.CIRCLE,
              fillColor: p.neutral ? "#6b7785" : (p.color ?? "#1a6fe0"),
              fillOpacity: 1,
              strokeColor: selectedId === p.id ? "#172536" : "#ffffff",
              strokeWeight: selectedId === p.id ? 4 : 2,
              scale: selectedId === p.id ? 13 : 11,
            }}
            zIndex={selectedId === p.id ? 1000 : p.index ?? 1}
            onClick={() => onSelect?.(p.id)}
          />
        ))}
        <FitBounds points={points} />
        {route && points.length > 1 && (
          <RouteLine route={{ id: "default", color: "#1a6fe0", points }} />
        )}
        {routes.map((mapRoute) => (
          <RouteLine key={mapRoute.id} route={mapRoute} />
        ))}
      </Map>
    </APIProvider>
  );
}
