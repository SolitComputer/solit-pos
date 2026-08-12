export const CAREER_LEVELS = [
    "NEWBIE",
    "BASIC 1",
    "BASIC 2",
    "BASIC 3",
    "KNOWLEDGE 1",
    "KNOWLEDGE 2",
    "KNOWLEDGE 3",
] as const;

export type CareerLevel = typeof CAREER_LEVELS[number];

export const CAREER_LEVEL_META: Record<CareerLevel, { bg: string; color: string; border: string }> = {
    "NEWBIE": { bg: "bg-slate-100", color: "text-slate-600", border: "border-slate-200" },
    "BASIC 1": { bg: "bg-sky-50", color: "text-sky-600", border: "border-sky-200" },
    "BASIC 2": { bg: "bg-sky-100", color: "text-sky-700", border: "border-sky-300" },
    "BASIC 3": { bg: "bg-blue-100", color: "text-blue-700", border: "border-blue-300" },
    "KNOWLEDGE 1": { bg: "bg-violet-50", color: "text-violet-600", border: "border-violet-200" },
    "KNOWLEDGE 2": { bg: "bg-violet-100", color: "text-violet-700", border: "border-violet-300" },
    "KNOWLEDGE 3": { bg: "bg-purple-100", color: "text-purple-700", border: "border-purple-300" },
};

export function isValidCareerLevel(value: unknown): value is CareerLevel {
    return typeof value === "string" && (CAREER_LEVELS as readonly string[]).includes(value);
}