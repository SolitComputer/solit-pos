import { CAREER_LEVEL_META, CareerLevel } from "@/lib/careerLevels";

export function CareerLevelBadge({ level }: { level?: string | null }) {
    if (!level) return null;
    const meta = CAREER_LEVEL_META[level as CareerLevel] ?? { bg: "bg-slate-100", color: "text-slate-600", border: "border-slate-200" };
    return (
        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${meta.bg} ${meta.color} ${meta.border}`}>
            {level}
        </span>
    );
}