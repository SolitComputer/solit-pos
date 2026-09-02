"use client";

import { useEffect, useRef } from "react";
import {
  Chart as ChartJS, CategoryScale, LinearScale,
  BarController, BarElement, LineController, LineElement, PointElement, Tooltip, Legend,
} from "chart.js";

ChartJS.register(CategoryScale, LinearScale, BarController, BarElement, LineController, LineElement, PointElement, Tooltip, Legend);

const fmtShort = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("id-ID", { day: "2-digit", month: "short" });

export default function TripTrendChart({ daily }: { daily: [string, { trips: number; distance: number }][] }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartRef = useRef<ChartJS | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    chartRef.current?.destroy(); // buang instance lama sebelum gambar ulang

    chartRef.current = new ChartJS(canvasRef.current, {
      type: "bar",
      data: {
        labels: daily.map(([d]) => fmtShort(d)),
        datasets: [
          { type: "bar", label: "Trip", data: daily.map(([, v]) => v.trips), backgroundColor: "rgba(37,99,235,0.75)", borderRadius: 6, yAxisID: "y" },
          { type: "line", label: "Jarak (km)", data: daily.map(([, v]) => +(v.distance / 1000).toFixed(1)), borderColor: "#f97316", backgroundColor: "#f97316", tension: 0.3, pointRadius: 3, yAxisID: "y1" },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: { legend: { position: "top", labels: { boxWidth: 12, font: { size: 11 } } } },
        scales: {
          y: { type: "linear", position: "left", beginAtZero: true, ticks: { precision: 0 }, title: { display: true, text: "Trip" } },
          y1: { type: "linear", position: "right", beginAtZero: true, grid: { drawOnChartArea: false }, title: { display: true, text: "km" } },
        },
      },
    });

    return () => { chartRef.current?.destroy(); chartRef.current = null; };
  }, [daily]);

  return <canvas ref={canvasRef} />;
}
