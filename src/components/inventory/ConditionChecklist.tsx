"use client";

import {
    CONDITION_CHECK_ITEMS, ConditionCheckKey, ConditionCheckResult, ConditionChecks,
} from "@/lib/conditionChecks";

interface Props {
    value: ConditionChecks;
    onChange: (next: ConditionChecks) => void;
    readOnly?: boolean;
}

const RESULT_OPTIONS: { value: ConditionCheckResult; label: string; activeCls: string }[] = [
    { value: "OKE", label: "Oke", activeCls: "bg-emerald-600 text-white border-emerald-600" },
    { value: "TIDAK_OKE", label: "Tidak Oke", activeCls: "bg-rose-600 text-white border-rose-600" },
];

export default function ConditionChecklist({ value, onChange, readOnly = false }: Props) {
    const filledCount = Object.keys(value).length;

    if (readOnly && filledCount === 0) {
        return (
            <p className="text-xs text-zinc-400 bg-zinc-50 border border-zinc-100 rounded-xl px-3 py-2.5">
                Belum ada hasil tes. Hanya bisa diisi oleh Rafi Salim &amp; Fikri Aryansyah.
            </p>
        );
    }

    const update = (key: ConditionCheckKey, patch: Partial<{ result: ConditionCheckResult | null; note: string }>) => {
        const current = value[key] ?? { result: null, note: "" };
        const merged = { ...current, ...patch };
        const next = { ...value };
        if (!merged.result && !merged.note) delete next[key];
        else next[key] = merged;
        onChange(next);
    };

    return (
        <div className="border border-zinc-200 rounded-xl divide-y divide-zinc-100">
            {readOnly && (
                <p className="text-[11px] text-zinc-400 px-3 py-2 bg-zinc-50 rounded-t-xl">
                    Hanya bisa diubah oleh Rafi Salim &amp; Fikri Aryansyah.
                </p>
            )}
            {CONDITION_CHECK_ITEMS.map(item => {
                const entry = value[item.key];
                if (readOnly && !entry) return null;
                return (
                    <div key={item.key} className="px-3 py-2.5 space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-zinc-700">{item.label}</span>
                            <div className="flex gap-1.5">
                                {RESULT_OPTIONS.map(opt => {
                                    const active = entry?.result === opt.value;
                                    return (
                                        <button
                                            key={opt.value}
                                            type="button"
                                            disabled={readOnly}
                                            onClick={() => update(item.key, { result: active ? null : opt.value })}
                                            className={`h-7 px-2.5 rounded-lg border text-[11px] font-semibold transition ${active
                                                ? opt.activeCls
                                                : "bg-white text-zinc-500 border-zinc-200 hover:bg-zinc-50"
                                                } ${readOnly ? "cursor-default" : ""} ${readOnly && !active ? "opacity-40" : ""}`}
                                        >
                                            {opt.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                        {readOnly ? (
                            entry?.note && <p className="text-[11px] text-zinc-500 italic">{entry.note}</p>
                        ) : (
                            <input
                                className="w-full h-8 border border-zinc-200 rounded-lg px-2.5 text-xs bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-500/20 focus:border-zinc-400"
                                placeholder="Note (opsional)"
                                value={entry?.note ?? ""}
                                onChange={e => update(item.key, { note: e.target.value })}
                            />
                        )}
                    </div>
                );
            })}
        </div>
    );
}
