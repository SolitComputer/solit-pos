"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { reverseGeocode, classifyStop, haversineM, bearingDeg, fmtSpeed } from "@/lib/geo";

export interface TrackPoint { lat: number; lng: number; t?: number; speed?: number | null; phase?: "GO" | "RETURN" }
interface Props {
  points: TrackPoint[];
  routeLine?: [number, number][] | null;     // rute terencana (opsional)
  destination?: { lat: number; lng: number } | null;
  height?: number;
}
interface StopInfo { lat: number; lng: number; durS: number; key: string }

declare global { interface Window { L?: any } }

// Kelompokkan titik diam berurutan → titik berhenti
function computeStops(points: TrackPoint[]): StopInfo[] {
  const stops: StopInfo[] = [];
  let i = 0;
  while (i < points.length) {
    let j = i + 1;
    while (j < points.length && haversineM(points[i], points[j]) < 25) j++;
    const startT = points[i].t, endT = points[j - 1].t;
    if (startT != null && endT != null) {
      const durS = (endT - startT) / 1000;
      if (durS >= 45 && j - i >= 2) {
        const slice = points.slice(i, j);
        const lat = slice.reduce((s, p) => s + p.lat, 0) / slice.length;
        const lng = slice.reduce((s, p) => s + p.lng, 0) / slice.length;
        stops.push({ lat, lng, durS, key: `${lat.toFixed(4)},${lng.toFixed(4)}` });
      }
    }
    i = j > i ? j : i + 1;
  }
  return stops;
}

export default function DeliveryMap({ points, routeLine, destination, height = 360 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const roadLayerRef = useRef<any>(null);
  const satLayerRef = useRef<any>(null);
  const motoRef = useRef<any>(null);
  const destRef = useRef<any>(null);
  const goTrailRef = useRef<any>(null);
  const returnTrailRef = useRef<any>(null);
  const plannedRef = useRef<any>(null);
  const stopMarkersRef = useRef<Map<string, any>>(new Map());
  const rafRef = useRef<number | null>(null);
  const followRef = useRef(true);
  const seededRef = useRef(false);
  const lastGeoRef = useRef<{ lat: number; lng: number } | null>(null);

  const [mapType, setMapType] = useState<"road" | "sat">("road");
  const [ready, setReady] = useState(false);
  const [street, setStreet] = useState<string>("Mendeteksi lokasi...");

  const latest = points[points.length - 1] ?? null;
  const stops = useMemo(() => computeStops(points), [points]);

  const remainingM = useMemo(() => {
    if (!latest || !destination) return null;
    return haversineM(latest, destination);
  }, [latest, destination]);

  // ── Inject Leaflet sekali, init map ──
  useEffect(() => {
    let cancelled = false;
    const ensureLeaflet = (): Promise<any> =>
      new Promise((resolve) => {
        if (window.L) return resolve(window.L);
        if (!document.getElementById("leaflet-css")) {
          const link = document.createElement("link");
          link.id = "leaflet-css"; link.rel = "stylesheet";
          link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
          document.head.appendChild(link);
        }
        const existing = document.getElementById("leaflet-js") as HTMLScriptElement | null;
        if (existing) { existing.addEventListener("load", () => resolve(window.L)); return; }
        const s = document.createElement("script");
        s.id = "leaflet-js"; s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
        s.onload = () => resolve(window.L);
        document.body.appendChild(s);
      });

    ensureLeaflet().then((L) => {
      if (cancelled || !containerRef.current || mapRef.current) return;
      const start = points[0] || destination || { lat: -6.4025, lng: 106.7942 };
      const map = L.map(containerRef.current, { center: [start.lat, start.lng], zoom: 16, zoomControl: true, attributionControl: false });
      mapRef.current = map;

      roadLayerRef.current = L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
        { maxZoom: 20, detectRetina: true, subdomains: "abcd" }
      ).addTo(map);
      satLayerRef.current = L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        { maxZoom: 19 }
      );

      map.on("dragstart", () => { followRef.current = false; });

      // rute terencana (garis putus-putus abu)
      plannedRef.current = L.polyline([], { color: "#94a3b8", weight: 4, opacity: 0.7, dashArray: "8 10" }).addTo(map);
      // jejak GO (biru) + PULANG (oranye)
      goTrailRef.current = L.polyline([], { color: "#2563eb", weight: 5, opacity: 0.85, lineJoin: "round", lineCap: "round" }).addTo(map);
      returnTrailRef.current = L.polyline([], { color: "#f97316", weight: 5, opacity: 0.85, lineJoin: "round", lineCap: "round" }).addTo(map);

      if (destination) {
        destRef.current = L.marker([destination.lat, destination.lng], {
          icon: L.divIcon({ className: "", html: `<div style="font-size:32px;filter:drop-shadow(0 2px 3px rgba(0,0,0,.45))">📍</div>`, iconSize: [32, 32], iconAnchor: [16, 30] }),
        }).addTo(map);
      }

      const motoHtml = `
        <div style="position:relative;width:46px;height:46px;">
          <div style="position:absolute;inset:0;border-radius:9999px;background:rgba(37,99,235,.25);animation:motoPulse 1.6s ease-out infinite;"></div>
          <div class="moto-rot" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;transition:transform .3s linear;">
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

  // ── Rute terencana ──
  useEffect(() => {
    if (!plannedRef.current) return;
    plannedRef.current.setLatLngs(routeLine ?? []);
  }, [routeLine]);

  // ── Points berubah → update trail + glide motor + rotasi + reverse geocode ──
  useEffect(() => {
    const L = window.L;
    if (!L || !mapRef.current || !motoRef.current || points.length === 0) return;

    goTrailRef.current?.setLatLngs(points.filter((p) => p.phase !== "RETURN").map((p) => [p.lat, p.lng]));
    returnTrailRef.current?.setLatLngs(points.filter((p) => p.phase === "RETURN").map((p) => [p.lat, p.lng]));

    const target = points[points.length - 1];
    const prev = points[points.length - 2];

    // rotasi marker sesuai arah
    if (prev) {
      const hd = bearingDeg(prev, target);
      const el = motoRef.current.getElement()?.querySelector(".moto-rot") as HTMLElement | null;
      if (el) el.style.transform = `rotate(${hd}deg)`;
    }

    // reverse geocode nama jalan (kalau pindah > 120m dari titik terakhir yg di-geocode)
    const lastGeo = lastGeoRef.current;
    if (!lastGeo || haversineM(lastGeo, target) > 120) {
      lastGeoRef.current = { lat: target.lat, lng: target.lng };
      reverseGeocode(target.lat, target.lng).then((r) => { if (r) setStreet(r.label); });
    }

    // titik pertama → snap & fit
    if (!seededRef.current) {
      seededRef.current = true;
      motoRef.current.setLatLng([target.lat, target.lng]);
      const pts: [number, number][] = points.map((p) => [p.lat, p.lng]);
      if (destination) pts.push([destination.lat, destination.lng]);
      if (pts.length >= 2) mapRef.current.fitBounds(pts, { padding: [60, 60], maxZoom: 17 });
      else mapRef.current.setView([target.lat, target.lng], 16);
      return;
    }

    // glide mulus dari posisi marker SEKARANG ke target
    const cur = motoRef.current.getLatLng();
    const from = { lat: cur.lat, lng: cur.lng };
    const duration = 1800;
    const startT = performance.now();
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const step = (now: number) => {
      const t = Math.min(1, (now - startT) / duration);
      const e = 1 - Math.pow(1 - t, 2); // ease-out
      const lat = from.lat + (target.lat - from.lat) * e;
      const lng = from.lng + (target.lng - from.lng) * e;
      motoRef.current.setLatLng([lat, lng]);
      if (followRef.current && mapRef.current) mapRef.current.panTo([lat, lng], { animate: false });
      if (t < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points]);

  // ── Marker berhenti + klasifikasi ──
  useEffect(() => {
    const L = window.L;
    if (!L || !mapRef.current) return;
    stops.forEach((stop) => {
      if (stopMarkersRef.current.has(stop.key)) return;
      reverseGeocode(stop.lat, stop.lng).then((r) => {
        if (!mapRef.current || stopMarkersRef.current.has(stop.key)) return;
        const info = classifyStop(r);
        const mins = Math.round(stop.durS / 60);
        const m = L.marker([stop.lat, stop.lng], {
          icon: L.divIcon({
            className: "",
            html: `<div style="display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:9999px;background:${info.suspect ? "#fef3c7" : "#fff"};border:2px solid ${info.suspect ? "#f59e0b" : "#cbd5e1"};box-shadow:0 2px 6px rgba(0,0,0,.3);font-size:15px;">${info.emoji}</div>`,
            iconSize: [30, 30], iconAnchor: [15, 15],
          }),
        }).addTo(mapRef.current);
        m.bindPopup(`<b>${info.emoji} Berhenti ${mins} mnt</b><br>${info.kind}`);
        stopMarkersRef.current.set(stop.key, m);
      });
    });
  }, [stops]);

  // ── Destination berubah ──
  useEffect(() => {
    const L = window.L;
    if (!L || !mapRef.current || !destination) return;
    if (destRef.current) destRef.current.setLatLng([destination.lat, destination.lng]);
    else destRef.current = L.marker([destination.lat, destination.lng], {
      icon: L.divIcon({ className: "", html: `<div style="font-size:32px;filter:drop-shadow(0 2px 3px rgba(0,0,0,.45))">📍</div>`, iconSize: [32, 32], iconAnchor: [16, 30] }),
    }).addTo(mapRef.current);
  }, [destination]);

  const toggleType = () => {
    const map = mapRef.current;
    if (!map || !roadLayerRef.current || !satLayerRef.current) return;
    if (mapType === "road") { map.removeLayer(roadLayerRef.current); satLayerRef.current.addTo(map); setMapType("sat"); }
    else { map.removeLayer(satLayerRef.current); roadLayerRef.current.addTo(map); setMapType("road"); }
  };
  const recenter = () => {
    followRef.current = true;
    if (latest && mapRef.current) mapRef.current.setView([latest.lat, latest.lng], 17, { animate: true });
  };

  return (
    <div style={{ position: "relative" }}>
      <div ref={containerRef} style={{ height, width: "100%", borderRadius: 16, overflow: "hidden", zIndex: 0 }} />

      {!ready && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "#eef2f7", borderRadius: 16, fontSize: 12, color: "#64748b", fontWeight: 600 }}>
          Memuat peta...
        </div>
      )}

      {/* HUD nama jalan + speed + sisa jarak */}
      {ready && (
        <div style={{ position: "absolute", left: 10, right: 10, top: 10, zIndex: 500, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
          <div style={{ background: "rgba(26,26,46,.92)", color: "#fff", borderRadius: 12, padding: "7px 12px", display: "flex", alignItems: "center", gap: 12, fontSize: 12, fontWeight: 700, boxShadow: "0 4px 14px rgba(0,0,0,.3)", maxWidth: "92%" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
              <span>🛣️</span>
              <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 180 }}>{street}</span>
            </span>
            <span style={{ background: "#2563eb", borderRadius: 8, padding: "2px 8px", whiteSpace: "nowrap" }}>{fmtSpeed(latest?.speed)}</span>
            {remainingM != null && (
              <span style={{ background: "#10b981", borderRadius: 8, padding: "2px 8px", whiteSpace: "nowrap" }}>
                {remainingM >= 1000 ? `${(remainingM / 1000).toFixed(1)} km` : `${Math.round(remainingM)} m`}
              </span>
            )}
          </div>
        </div>
      )}

      <button type="button" onClick={toggleType}
        style={{ position: "absolute", left: 10, bottom: 10, zIndex: 500, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "7px 11px", fontSize: 12, fontWeight: 700, color: "#1a1a2e", boxShadow: "0 2px 8px rgba(0,0,0,.15)", cursor: "pointer" }}>
        {mapType === "road" ? "🛰️ Satelit" : "🗺️ Peta"}
      </button>
      <button type="button" onClick={recenter}
        style={{ position: "absolute", right: 10, bottom: 10, zIndex: 500, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "8px 11px", fontSize: 12, fontWeight: 700, color: "#1a1a2e", boxShadow: "0 2px 8px rgba(0,0,0,.15)", cursor: "pointer" }}>
        🎯 Ikuti motor
      </button>
    </div>
  );
}