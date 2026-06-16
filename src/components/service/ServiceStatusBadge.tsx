"use client";

import type { ServiceStatus } from "@/types/service";
import { STATUS_LABEL, STATUS_COLOR } from "@/types/service";

export default function ServiceStatusBadge({ status }: { status: ServiceStatus }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[11px] font-semibold border ${STATUS_COLOR[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}