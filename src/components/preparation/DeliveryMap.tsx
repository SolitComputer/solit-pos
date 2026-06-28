"use client";

import { useEffect, useRef, useState } from "react";

interface LatLng { lat: number; lng: number }
interface Props {
  points: LatLng[];
  destination?: LatLng | null;
  height?: number;
}

declare global {
  interface Window { L?: any }
}

export default function DeliveryMap({ points, destination, height = 360 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const roadLayerRef = useRef<any>(null);
  const satLayerRef = useRef<any>(null);
  const motoRef = useRef<any>(null);
  const destRef = useRef<any>(null);
  const trailRef = useRef<any>(null);
  const rafRef = useRef<number | null>(null);
  const followRef = useRef<boolean>(true);
  const seededRef = useRef<boolean>(false);

  const [mapType, setMapType] = useState<"road" | "sat">("road");
  const [ready, setReady] = useState(false);

  // ── Inject Leaflet sekali, lalu init map ──
  useEffect(() => {
    let cancelled = false;

    const ensureLeaflet = (): Promise<any> =>
      new Promise((resolve) => {
        if (window.L) return resolve(window.L);
        if (!document.getElementById("leaflet-css")) {
          const link = document.createElement("link");
          link.id = "leaflet-css";
          link.rel = "stylesheet";
          link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
          document.head.appendChild(link);
        }
        const existing = document.getElementById("leaflet-js") as HTMLScriptElement | null;
        if (existing) { existing.addEventListener("load", () => resolve(window.L)); return; }
        const script = document.createElement("script");
        script.id = "leaflet-js";
        script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
        script.onload = () => resolve(window.L);
        document.body.appendChild(script);
      });

    ensureLeaflet().then((L) => {
      if (cancelled || !containerRef.current || mapRef.current) return;

      const start = points[0] || destination || { lat: -6.4025, lng: 106.7942 }; // default Depok
      const map = L.map(containerRef.current, {
        center: [start.lat, start.lng],
        zoom: 16,
        zoomControl: true,
        attributionControl: false,
      });
      mapRef.current = map;

      // Tile PETA (mirip Google Maps, HD/retina) — CartoDB Voyager
      roadLayerRef.current = L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
        { maxZoom: 20, detectRetina: true, subdomains: "abcd" }
      );
      // Tile SATELIT (HD) — Esri World Imagery
      satLayerRef.current = L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        { maxZoom: 19 }
      );
      roadLayerRef.current.addTo(map);

      // Kalau user geser map → matikan auto-follow
      map.on("dragstart", () => { followRef.current = false; });

      // Marker tujuan (pin merah)
      if (destination) {
        destRef.current = L.marker([destination.lat, destination.lng], {
          icon: L.divIcon({
            className: "",
            html: `<div style="font-size:32px;line-height:1;filter:drop-shadow(0 2px 3px rgba(0,0,0,.45))">📍</div>`,
            iconSize: [32, 32], iconAnchor: [16, 30],
          }),
        }).addTo(map);
      }

      // Polyline jejak rute
      trailRef.current = L.polyline([], {
        color: "#2563eb", weight: 5, opacity: 0.6, lineJoin: "round", lineCap: "round",
      }).addTo(map);

      // Marker MOTOR + ring pulse
      const motoHtml = `
        <div style="position:relative;width:46px;height:46px;">
          <div style="position:absolute;inset:0;border-radius:9999px;background:rgba(37,99,235,.25);animation:motoPulse 1.6s ease-out infinite;"></div>
          <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;">
            <div style="width:36px;height:36px;border-radius:9999px;background:#fff;border:3px solid #2563eb;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 10px rgba(0,0,0,.4);font-size:19px;">🏍️</div>
          </div>
        </div>`;
      motoRef.current = L.marker([start.lat, start.lng], {
        icon: L.divIcon({ className: "", html: motoHtml, iconSize: [46, 46], iconAnchor: [23, 23] }),
        zIndexOffset: 1000,
      }).addTo(map);

      if (!document.getElementById("moto-style")) {
        const st = document.createElement("style");
        st.id = "moto-style";
        st.textContent = `@keyframes motoPulse{0%{transform:scale(.5);opacity:.7}100%{transform:scale(1.9);opacity:0}}`;
        document.head.appendChild(st);
      }

      setReady(true);
    });

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Saat points berubah → glide motor ke titik terbaru (mulus, tanpa teleport) ──
  useEffect(() => {
    const L = window.L;
    if (!L || !mapRef.current || !motoRef.current || points.length === 0) return;

    // Update jejak rute
    trailRef.current?.setLatLngs(points.map((p) => [p.lat, p.lng]));

    const target = points[points.length - 1];

    // Titik pertama: snap langsung + fit, jangan glide dari lokasi default
    if (!seededRef.current) {
      seededRef.current = true;
      motoRef.current.setLatLng([target.lat, target.lng]);
      const pts: [number, number][] = points.map((p) => [p.lat, p.lng]);
      if (destination) pts.push([destination.lat, destination.lng]);
      if (pts.length >= 2) mapRef.current.fitBounds(pts, { padding: [60, 60], maxZoom: 17 });
      else mapRef.current.setView([target.lat, target.lng], 16);
      return;
    }

    // Glide dari posisi marker SEKARANG ke target (anti-patah walau update nyela)
    const cur = motoRef.current.getLatLng();
    const from = { lat: cur.lat, lng: cur.lng };
    const duration = 2000; // ms
    const startT = performance.now();
    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    const step = (now: number) => {
      const t = Math.min(1, (now - startT) / duration);
      const lat = from.lat + (target.lat - from.lat) * t;
      const lng = from.lng + (target.lng - from.lng) * t;
      motoRef.current.setLatLng([lat, lng]);
      if (followRef.current && mapRef.current) mapRef.current.panTo([lat, lng], { animate: false });
      if (t < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points]);

  // ── Update marker tujuan kalau berubah ──
  useEffect(() => {
    const L = window.L;
    if (!L || !mapRef.current || !destination) return;
    if (destRef.current) destRef.current.setLatLng([destination.lat, destination.lng]);
    else {
      destRef.current = L.marker([destination.lat, destination.lng], {
        icon: L.divIcon({
          className: "",
          html: `<div style="font-size:32px;line-height:1;filter:drop-shadow(0 2px 3px rgba(0,0,0,.45))">📍</div>`,
          iconSize: [32, 32], iconAnchor: [16, 30],
        }),
      }).addTo(mapRef.current);
    }
  }, [destination]);

  const toggleType = () => {
    const map = mapRef.current;
    if (!map || !roadLayerRef.current || !satLayerRef.current) return;
    if (mapType === "road") { map.removeLayer(roadLayerRef.current); satLayerRef.current.addTo(map); setMapType("sat"); }
    else { map.removeLayer(satLayerRef.current); roadLayerRef.current.addTo(map); setMapType("road"); }
  };

  const recenter = () => {
    followRef.current = true;
    const last = points[points.length - 1];
    if (last && mapRef.current) mapRef.current.setView([last.lat, last.lng], 17, { animate: true });
  };

  return (
    <div style={{ position: "relative" }}>
      <div ref={containerRef} style={{ height, width: "100%", borderRadius: 16, overflow: "hidden", zIndex: 0 }} />

      {!ready && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "#eef2f7", borderRadius: 16, fontSize: 12, color: "#64748b", fontWeight: 600 }}>
          Memuat peta...
        </div>
      )}

      {/* Toggle Peta / Satelit */}
      <button type="button" onClick={toggleType}
        style={{ position: "absolute", left: 10, top: 10, zIndex: 500, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "7px 11px", fontSize: 12, fontWeight: 700, color: "#1a1a2e", boxShadow: "0 2px 8px rgba(0,0,0,.15)", cursor: "pointer" }}>
        {mapType === "road" ? "🛰️ Satelit" : "🗺️ Peta"}
      </button>

      {/* Re-center ke motor */}
      <button type="button" onClick={recenter}
        style={{ position: "absolute", right: 10, bottom: 10, zIndex: 500, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "8px 11px", fontSize: 12, fontWeight: 700, color: "#1a1a2e", boxShadow: "0 2px 8px rgba(0,0,0,.15)", cursor: "pointer" }}>
        🎯 Ikuti motor
      </button>
    </div>
  );
}