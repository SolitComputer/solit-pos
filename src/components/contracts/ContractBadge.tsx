import { CONTRACT_STATUS_META, CONTRACT_WARNING_DAYS, ContractStatus } from "@/lib/contractTemplates";

export function ContractBadge({ status, validUntil }: { status?: string | null; validUntil?: string | null }) {
  const s = (status as ContractStatus) || "NONE";

  if (s === "APPROVED" && validUntil) {
    const todayWIB = new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const daysLeft = Math.ceil((new Date(validUntil).getTime() - new Date(todayWIB).getTime()) / 86400000);
    if (daysLeft >= 0 && daysLeft <= CONTRACT_WARNING_DAYS) {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border bg-amber-100 text-amber-700 border-amber-200">
          Berakhir {daysLeft} hari lagi
        </span>
      );
    }
  }

  const meta = CONTRACT_STATUS_META[s] ?? CONTRACT_STATUS_META.NONE;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${meta.bg} ${meta.color} ${meta.border}`}>
      {meta.label}
    </span>
  );
}