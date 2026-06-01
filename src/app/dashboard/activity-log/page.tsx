"use client";

import DashboardLayout from "@/components/layout/DashboardLayout";
import { useEffect, useState } from "react";

type Log = {
    id: string;
    user_name: string;
    user_role: string;
    action: string;
    entity: string;
    entity_label: string | null;
    entity_id: string | null;
    before_data: Record<string, any> | null;
    after_data: Record<string, any> | null;
    created_at: string;
};

const ACTION_STYLE: Record<string, string> = {
    CREATE: "bg-emerald-50 text-emerald-700",
    EDIT: "bg-amber-50 text-amber-700",
    DELETE: "bg-red-50 text-red-600",
    RESTORE: "bg-sky-50 text-sky-700",
};

const ENTITY_LABEL: Record<string, string> = {
    laptop: "Laptop",
    unit: "Unit",
    transaction: "Transaksi",
    warranty: "Garansi",
};

function formatDate(iso: string) {
    return new Intl.DateTimeFormat("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    }).format(new Date(iso));
}

function DiffView({ before, after }: { before: any; after: any }) {
    if (!before && !after) return null;

    const keys = Array.from(
        new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])
    ).filter((k) => {
        // Hanya tampilkan field yang berubah, skip created_at/id
        if (["id", "created_at", "updated_at", "last_edited_at"].includes(k)) return false;
        if (!before) return true; // CREATE — semua field "after"
        return JSON.stringify(before[k]) !== JSON.stringify(after?.[k]);
    });

    if (keys.length === 0) return <p className="text-xs text-gray-400 italic">Tidak ada perubahan terdeteksi.</p>;

    return (
        <div className="mt-2 space-y-1.5">
            {keys.map((k) => (
                <div key={k} className="text-xs">
                    <span className="font-mono text-gray-500">{k}:</span>
                    <div className="flex gap-2 flex-wrap mt-0.5">
                        {before && before[k] !== undefined && (
                            <span className="bg-red-50 text-red-600 px-1.5 py-0.5 rounded line-through">
                                {String(before[k] ?? "—")}
                            </span>
                        )}
                        {after && after[k] !== undefined && (
                            <span className="bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded">
                                {String(after[k] ?? "—")}
                            </span>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
}

export default function ActivityLogPage() {
    const [logs, setLogs] = useState<Log[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState<string | null>(null);

    // Filter state
    const [filterEntity, setFilterEntity] = useState("");
    const [filterAction, setFilterAction] = useState("");

    const limit = 20;

    const fetchLogs = async () => {
        setLoading(true);
        const params = new URLSearchParams({
            page: String(page),
            limit: String(limit),
            ...(filterEntity ? { entity: filterEntity } : {}),
            ...(filterAction ? { action: filterAction } : {}),
        });
        const res = await fetch(`/api/activity-logs?${params}`);
        const data = await res.json();
        setLogs(data.logs ?? []);
        setTotal(data.total ?? 0);
        setLoading(false);
    };

    useEffect(() => { fetchLogs(); }, [page, filterEntity, filterAction]);

    // Reset page kalau filter berubah
    useEffect(() => { setPage(1); }, [filterEntity, filterAction]);

    const totalPages = Math.ceil(total / limit);

    return (
        <DashboardLayout>

            <div className="max-w-5xl mx-auto px-4 py-6">
                <div className="mb-6">
                    <h1 className="text-xl font-bold text-[#1a1a2e]">Log Aktivitas</h1>
                    <p className="text-sm text-gray-500 mt-0.5">
                        Seluruh aktivitas sistem tercatat di sini — hanya terlihat oleh Admin.
                    </p>
                </div>

                {/* Filter */}
                <div className="flex gap-3 mb-4 flex-wrap">
                    <select
                        value={filterEntity}
                        onChange={(e) => setFilterEntity(e.target.value)}
                        className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 outline-none focus:ring-2 focus:ring-[#1a1a2e]/20"
                    >
                        <option value="">Semua Entitas</option>
                        <option value="laptop">Laptop</option>
                        <option value="unit">Unit</option>
                        <option value="transaction">Transaksi</option>
                        <option value="warranty">Garansi</option>
                    </select>

                    <select
                        value={filterAction}
                        onChange={(e) => setFilterAction(e.target.value)}
                        className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 outline-none focus:ring-2 focus:ring-[#1a1a2e]/20"
                    >
                        <option value="">Semua Aksi</option>
                        <option value="CREATE">CREATE</option>
                        <option value="EDIT">EDIT</option>
                        <option value="RESTORE">RESTORE</option>
                        <option value="DELETE">DELETE</option>
                    </select>

                    <span className="ml-auto text-sm text-gray-400 self-center">
                        {total} log ditemukan
                    </span>
                </div>

                {/* Table */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    {loading ? (
                        <div className="p-8 text-center text-sm text-gray-400">Memuat log...</div>
                    ) : logs.length === 0 ? (
                        <div className="p-8 text-center text-sm text-gray-400">Belum ada log aktivitas.</div>
                    ) : (
                        <div className="divide-y divide-gray-50">
                            {logs.map((log) => (
                                <div key={log.id} className="px-5 py-3.5">
                                    <div className="flex items-start gap-3">
                                        {/* Action badge */}
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md flex-shrink-0 mt-0.5 ${ACTION_STYLE[log.action] ?? "bg-gray-100 text-gray-600"}`}>
                                            {log.action}
                                        </span>

                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="text-sm font-semibold text-gray-800">{log.user_name}</span>
                                                <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                                                    {log.user_role}
                                                </span>
                                                <span className="text-xs text-gray-400">
                                                    {log.action === "CREATE" ? "menambahkan" :
                                                        log.action === "EDIT" ? "mengubah" :
                                                            log.action === "RESTORE" ? "memulihkan" : "menghapus"}
                                                </span>
                                                <span className="text-xs font-medium text-gray-600">
                                                    {ENTITY_LABEL[log.entity] ?? log.entity}
                                                </span>
                                                {log.entity_label && (
                                                    <span className="text-xs text-gray-500 truncate max-w-[200px]">
                                                        — {log.entity_label}
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-[11px] text-gray-400 mt-0.5">{formatDate(log.created_at)}</p>

                                            {/* Expand detail */}
                                            {(log.before_data || log.after_data) && (
                                                <button
                                                    onClick={() => setExpanded(expanded === log.id ? null : log.id)}
                                                    className="text-[11px] text-[#1a1a2e]/60 hover:text-[#1a1a2e] mt-1.5 underline underline-offset-2"
                                                >
                                                    {expanded === log.id ? "Sembunyikan detail" : "Lihat detail perubahan"}
                                                </button>
                                            )}

                                            {expanded === log.id && (
                                                <div className="mt-2 p-3 bg-gray-50 rounded-xl border border-gray-100">
                                                    <DiffView before={log.before_data} after={log.after_data} />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="flex justify-center gap-2 mt-4">
                        <button
                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                            disabled={page === 1}
                            className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
                        >
                            ← Sebelumnya
                        </button>
                        <span className="px-3 py-1.5 text-sm text-gray-500">
                            {page} / {totalPages}
                        </span>
                        <button
                            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                            disabled={page === totalPages}
                            className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
                        >
                            Selanjutnya →
                        </button>
                    </div>
                )}
            </div>
        </DashboardLayout>
    );
}