"use client";

import {
  Chart as ChartJS,
  CategoryScale, LinearScale,
  PointElement, LineElement, BarElement,
  Filler, Tooltip, Legend,
} from "chart.js";
import { Line, Bar } from "react-chartjs-2";

ChartJS.register(
  CategoryScale, LinearScale,
  PointElement, LineElement, BarElement,
  Filler, Tooltip, Legend
);

export const LineChart: typeof Line = Line;
export const BarChart: typeof Bar = Bar;
