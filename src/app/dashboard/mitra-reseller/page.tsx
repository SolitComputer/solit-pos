import { Metadata } from "next";
import MitraResellerClient from "./MitraResellerClient";

export const metadata: Metadata = {
  title: "Mitra & Reseller — Solit POS",
};

export default function MitraResellerPage() {
  return <MitraResellerClient />;
}