"use client";

import { useEffect, useRef } from "react";

let leafletPromise: Promise<any> | null = null;

function loadLeaflet(): Promise<any> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if ((window as any).L) return Promise.resolve((window as any).L);
  if (leafletPromise) return leafletPromise;

  leafletPromise = new Promise((resolve, reject) => {
    const cssHref = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    if (!document.querySelector(`link[href="${cssHref}"]`)) {
      const css = document.createElement("link");
      css.rel = "stylesheet";
      css.href = cssHref;
      document.head.appendChild(css);
    }
    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.async = true;
    script.onload = () => resolve((window as any).L);
    script.onerror = () => reject(new Error("Gagal memuat peta"));
    document.head.appendChild(script);
  });
  return leafletPromise;
}

interface LatLng { lat: number; lng: number }
interface DeliveryMapProps { points: LatLng[]; destination?: LatLng | null; height?: number }

export default function DeliveryMap({ points, destination, height = 320 }: DeliveryMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const courierMarkerRef = useRef<any>(null);
  const destMarkerRef = useRef<any>(null);
  const routeRef = useRef<any>(null);
  const LRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;
    loadLeaflet().then((L) => {
      if (cancelled || !containerRef.current || mapRef.current) return;
      LRef.current = L;
      const start = points.length > 0 ? points[points.length - 1] : destination ?? { lat: -6.2, lng: 106.816 };
      const map = L.map(containerRef.current, { center: [start.lat, start.lng], zoom: 15 });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap", maxZoom: 19,
      }).addTo(map);
      mapRef.current = map;
      setTimeout(() => map.invalidateSize(), 200);
    }).catch((e) => console.error(e));

    return () => {
      cancelled = true;
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const L = LRef.current, map = mapRef.current;
    if (!L || !map) return;

    if (destination) {
      const destIcon = L.divIcon({
        className: "",
        html: `<div style="background:#dc2626;width:14px;height:14px;border-radius:50%;border:3px solid white;box-shadow:0 0 0 2px #dc2626"></div>`,
        iconSize: [14, 14], iconAnchor: [7, 7],
      });
      if (!destMarkerRef.current) destMarkerRef.current = L.marker([destination.lat, destination.lng], { icon: destIcon }).addTo(map).bindPopup("Tujuan");
      else destMarkerRef.current.setLatLng([destination.lat, destination.lng]);
    }

    if (points.length === 0) return;
    const latlngs = points.map((p) => [p.lat, p.lng]) as [number, number][];
    const last = latlngs[latlngs.length - 1];

    const courierIcon = L.divIcon({
      className: "",
      html: `<div style="background:#1a1a2e;width:16px;height:16px;border-radius:50%;border:3px solid white;box-shadow:0 0 0 2px #1a1a2e,0 0 12px rgba(26,26,46,.5)"></div>`,
      iconSize: [16, 16], iconAnchor: [8, 8],
    });
    if (!courierMarkerRef.current) courierMarkerRef.current = L.marker(last, { icon: courierIcon }).addTo(map).bindPopup("Posisi pengantar");
    else courierMarkerRef.current.setLatLng(last);

    if (!routeRef.current) routeRef.current = L.polyline(latlngs, { color: "#1a1a2e", weight: 4, opacity: 0.7 }).addTo(map);
    else routeRef.current.setLatLngs(latlngs);

    const all = [...latlngs];
    if (destination) all.push([destination.lat, destination.lng]);
    if (all.length === 1) map.setView(all[0], 16);
    else map.fitBounds(all as any, { padding: [40, 40], maxZoom: 17 });
  }, [points, destination]);

  return (
    <div ref={containerRef} style={{ height, width: "100%", borderRadius: 16, overflow: "hidden", zIndex: 0 }}
      className="border border-gray-200 bg-gray-100" />
  );
}