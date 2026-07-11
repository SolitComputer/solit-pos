"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Priority = "low" | "medium" | "high";
type FilterType = "all" | "active" | "done";

interface Todo {
    id: string;
    user_id: string;
    title: string;
    description: string | null;
    is_done: boolean;
    priority: Priority;
    due_date: string | null;
    created_at: string;
    updated_at: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PRIORITY_CONFIG: Record<
    Priority,
    { label: string; color: string; bg: string; dot: string }
> = {
    high: {
        label: "Tinggi",
        color: "text-red-600",
        bg: "bg-red-50 border-red-200",
        dot: "bg-red-500",
    },
    medium: {
        label: "Sedang",
        color: "text-amber-600",
        bg: "bg-amber-50 border-amber-200",
        dot: "bg-amber-500",
    },
    low: {
        label: "Rendah",
        color: "text-sky-600",
        bg: "bg-sky-50 border-sky-200",
        dot: "bg-sky-400",
    },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(dateStr: string | null): string {
    if (!dateStr) return "";
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

function isOverdue(due_date: string | null, is_done: boolean): boolean {
    if (!due_date || is_done) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return new Date(due_date + "T00:00:00") < today;
}

function isDueToday(due_date: string | null, is_done: boolean): boolean {
    if (!due_date || is_done) return false;
    const today = new Date();
    const due = new Date(due_date + "T00:00:00");
    return (
        today.getFullYear() === due.getFullYear() &&
        today.getMonth() === due.getMonth() &&
        today.getDate() === due.getDate()
    );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function EmptyState({ filter }: { filter: FilterType }) {
    const messages: Record<FilterType, { icon: string; title: string; desc: string }> = {
        all: {
            icon: "✅",
            title: "Belum ada tugas",
            desc: "Tambah tugas pertamamu sekarang",
        },
        active: {
            icon: "🎉",
            title: "Semua tugas selesai!",
            desc: "Tidak ada tugas yang tertunda",
        },
        done: {
            icon: "📋",
            title: "Belum ada tugas selesai",
            desc: "Selesaikan tugas dan centang di sini",
        },
    };
    const { icon, title, desc } = messages[filter];
    return (
        <div className="flex flex-col items-center justify-center py-16 text-center">
            <span className="text-5xl mb-4">{icon}</span>
            <p className="text-base font-semibold text-gray-700">{title}</p>
            <p className="text-sm text-gray-400 mt-1">{desc}</p>
        </div>
    );
}

// ─── Add/Edit Modal ───────────────────────────────────────────────────────────

interface TodoFormModalProps {
    open: boolean;
    onClose: () => void;
    onSubmit: (data: {
        title: string;
        description: string;
        priority: Priority;
        due_date: string;
    }) => Promise<void>;
    initial?: Todo | null;
    loading: boolean;
}

function TodoFormModal({ open, onClose, onSubmit, initial, loading }: TodoFormModalProps) {
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [priority, setPriority] = useState<Priority>("medium");
    const [dueDate, setDueDate] = useState("");
    const titleRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (open) {
            setTitle(initial?.title ?? "");
            setDescription(initial?.description ?? "");
            setPriority(initial?.priority ?? "medium");
            setDueDate(initial?.due_date ?? "");
            setTimeout(() => titleRef.current?.focus(), 80);
        }
    }, [open, initial]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim()) return;
        await onSubmit({ title, description, priority, due_date: dueDate });
    };

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
            onClick={(e) => e.target === e.currentTarget && onClose()}
        >
            <div
                className="bg-white rounded-2xl shadow-2xl w-full max-w-md"
                style={{ animation: "todoModalIn 0.2s ease-out both" }}
            >
                <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
                    <h2 className="text-base font-bold text-gray-900">
                        {initial ? "Edit Tugas" : "Tambah Tugas Baru"}
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
                    {/* Title */}
                    <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                            Judul Tugas <span className="text-red-500">*</span>
                        </label>
                        <input
                            ref={titleRef}
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="Contoh: Fix bug halaman pembayaran"
                            maxLength={200}
                            required
                            className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e] transition"
                        />
                    </div>

                    {/* Description */}
                    <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                            Deskripsi <span className="text-gray-400 font-normal">(opsional)</span>
                        </label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Detail tambahan tentang tugas ini..."
                            rows={3}
                            maxLength={1000}
                            className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e] transition resize-none"
                        />
                    </div>

                    {/* Priority + Due Date */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Prioritas</label>
                            <select
                                value={priority}
                                onChange={(e) => setPriority(e.target.value as Priority)}
                                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e] transition bg-white"
                            >
                                <option value="high">🔴 Tinggi</option>
                                <option value="medium">🟡 Sedang</option>
                                <option value="low">🔵 Rendah</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                                Deadline <span className="text-gray-400 font-normal">(opsional)</span>
                            </label>
                            <input
                                type="date"
                                value={dueDate}
                                onChange={(e) => setDueDate(e.target.value)}
                                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e] transition"
                            />
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 pt-1">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={loading}
                            className="flex-1 px-4 py-2.5 text-sm font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition"
                        >
                            Batal
                        </button>
                        <button
                            type="submit"
                            disabled={loading || !title.trim()}
                            className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-[#1a1a2e] hover:bg-[#2d2d4a] rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            {loading ? (
                                <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                    <path d="M21 12a9 9 0 11-6.219-8.56" />
                                </svg>
                            ) : null}
                            {initial ? "Simpan Perubahan" : "Tambah Tugas"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// ─── Todo Item Card ───────────────────────────────────────────────────────────

interface TodoItemProps {
    todo: Todo;
    onToggle: (id: string, is_done: boolean) => void;
    onEdit: (todo: Todo) => void;
    onDelete: (id: string) => void;
    toggling: string | null;
}

function TodoItem({ todo, onToggle, onEdit, onDelete, toggling }: TodoItemProps) {
    const overdue = isOverdue(todo.due_date, todo.is_done);
    const dueToday = isDueToday(todo.due_date, todo.is_done);
    const cfg = PRIORITY_CONFIG[todo.priority];
    const isToggling = toggling === todo.id;

    return (
        <div
            className={`group relative flex items-start gap-3 px-4 py-3.5 rounded-2xl border transition-all duration-200
        ${todo.is_done
                    ? "bg-gray-50 border-gray-100 opacity-75"
                    : `bg-white border-gray-100 hover:border-gray-200 hover:shadow-sm`
                }`}
        >
            {/* Priority accent bar */}
            <div
                className={`absolute left-0 top-3 bottom-3 w-1 rounded-r-full ${cfg.dot} ${todo.is_done ? "opacity-30" : ""}`}
            />

            {/* Checkbox */}
            <button
                onClick={() => onToggle(todo.id, !todo.is_done)}
                disabled={isToggling}
                className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all
          ${todo.is_done
                        ? "bg-emerald-500 border-emerald-500"
                        : "border-gray-300 hover:border-[#1a1a2e]"
                    } ${isToggling ? "opacity-50 animate-pulse" : ""}`}
                aria-label={todo.is_done ? "Tandai belum selesai" : "Tandai selesai"}
            >
                {todo.is_done && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5">
                        <polyline points="20 6 9 17 4 12" />
                    </svg>
                )}
            </button>

            {/* Content */}
            <div className="flex-1 min-w-0">
                <p
                    className={`text-sm font-semibold leading-snug break-words
            ${todo.is_done ? "line-through text-gray-400" : "text-gray-800"}`}
                >
                    {todo.title}
                </p>

                {todo.description && (
                    <p className={`text-xs mt-1 leading-relaxed break-words ${todo.is_done ? "text-gray-400" : "text-gray-500"}`}>
                        {todo.description}
                    </p>
                )}

                {/* Meta: priority + due date */}
                <div className="flex items-center flex-wrap gap-2 mt-2">
                    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.color}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                        {cfg.label}
                    </span>

                    {todo.due_date && (
                        <span
                            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full
                ${overdue
                                    ? "bg-red-50 text-red-600 border border-red-200"
                                    : dueToday
                                        ? "bg-orange-50 text-orange-600 border border-orange-200"
                                        : "bg-gray-50 text-gray-500 border border-gray-100"
                                }`}
                        >
                            {overdue ? "⚠️ " : dueToday ? "📅 Hari ini — " : ""}
                            {formatDate(todo.due_date)}
                        </span>
                    )}
                </div>
            </div>

            {/* Action buttons — show on hover */}
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                <button
                    onClick={() => onEdit(todo)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-[#1a1a2e] hover:bg-gray-100 transition"
                    aria-label="Edit tugas"
                    title="Edit"
                >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                        <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                </button>
                <button
                    onClick={() => onDelete(todo.id)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition"
                    aria-label="Hapus tugas"
                    title="Hapus"
                >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2" />
                    </svg>
                </button>
            </div>
        </div>
    );
}

// ─── Stats Bar ────────────────────────────────────────────────────────────────

function StatsBar({ todos }: { todos: Todo[] }) {
    const total = todos.length;
    const done = todos.filter((t) => t.is_done).length;
    const overdue = todos.filter((t) => isOverdue(t.due_date, t.is_done)).length;
    const dueToday = todos.filter((t) => isDueToday(t.due_date, t.is_done)).length;
    const pct = total === 0 ? 0 : Math.round((done / total) * 100);

    return (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            {[
                { label: "Total Tugas", value: total, icon: "📋", color: "text-gray-700" },
                { label: "Selesai", value: done, icon: "✅", color: "text-emerald-600" },
                { label: "Jatuh Tempo Hari Ini", value: dueToday, icon: "📅", color: "text-orange-600" },
                { label: "Terlambat", value: overdue, icon: "⚠️", color: "text-red-600" },
            ].map(({ label, value, icon, color }) => (
                <div key={label} className="bg-white rounded-2xl border border-gray-100 px-4 py-3">
                    <p className="text-xs text-gray-400 font-medium mb-1">{label}</p>
                    <p className={`text-2xl font-black ${color}`}>
                        {icon} {value}
                    </p>
                </div>
            ))}

            {/* Progress bar — full width */}
            {total > 0 && (
                <div className="col-span-2 sm:col-span-4 bg-white rounded-2xl border border-gray-100 px-4 py-3">
                    <div className="flex justify-between items-center mb-2">
                        <p className="text-xs font-semibold text-gray-600">Progress Keseluruhan</p>
                        <p className="text-xs font-bold text-emerald-600">{pct}% selesai</p>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600 rounded-full transition-all duration-700 ease-out"
                            style={{ width: `${pct}%` }}
                        />
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1">
                        {done} dari {total} tugas selesai
                    </p>
                </div>
            )}
        </div>
    );
}

// ─── Delete Confirm Modal ─────────────────────────────────────────────────────

function DeleteConfirmModal({
    open,
    onClose,
    onConfirm,
    loading,
}: {
    open: boolean;
    onClose: () => void;
    onConfirm: () => void;
    loading: boolean;
}) {
    if (!open) return null;
    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
            onClick={(e) => e.target === e.currentTarget && onClose()}
        >
            <div
                className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6"
                style={{ animation: "todoModalIn 0.2s ease-out both" }}
            >
                <div className="text-center mb-5">
                    <div className="w-12 h-12 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2" />
                        </svg>
                    </div>
                    <h3 className="text-base font-bold text-gray-900">Hapus Tugas?</h3>
                    <p className="text-sm text-gray-500 mt-1">Tindakan ini tidak bisa dibatalkan.</p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={onClose}
                        disabled={loading}
                        className="flex-1 px-4 py-2.5 text-sm font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition"
                    >
                        Batal
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={loading}
                        className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-xl transition disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {loading && (
                            <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <path d="M21 12a9 9 0 11-6.219-8.56" />
                            </svg>
                        )}
                        Hapus
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function TodosClient() {
    const [todos, setTodos] = useState<Todo[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Modal states
    const [formOpen, setFormOpen] = useState(false);
    const [editTarget, setEditTarget] = useState<Todo | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
    const [formLoading, setFormLoading] = useState(false);
    const [deleteLoading, setDeleteLoading] = useState(false);
    const [toggling, setToggling] = useState<string | null>(null);

    // Filter + search
    const [filter, setFilter] = useState<FilterType>("all");
    const [search, setSearch] = useState("");
    const [priorityFilter, setPriorityFilter] = useState<Priority | "all">("all");

    // Toast notifications
    const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
    const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const showToast = useCallback((msg: string, type: "success" | "error" = "success") => {
        if (toastTimer.current) clearTimeout(toastTimer.current);
        setToast({ msg, type });
        toastTimer.current = setTimeout(() => setToast(null), 3000);
    }, []);

    // ── Fetch todos ────────────────────────────────────────────────────────────

    const fetchTodos = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/todos");
            if (!res.ok) throw new Error("Gagal memuat tugas");
            const data = await res.json();
            setTodos(data.todos ?? []);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Terjadi kesalahan";
            setError(msg);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchTodos();
    }, [fetchTodos]);

    // ── Filtered + searched todos ──────────────────────────────────────────────

    const filteredTodos = useMemo(() => {
        let list = todos;
        if (filter === "active") list = list.filter((t) => !t.is_done);
        if (filter === "done") list = list.filter((t) => t.is_done);
        if (priorityFilter !== "all") list = list.filter((t) => t.priority === priorityFilter);
        if (search.trim()) {
            const q = search.toLowerCase();
            list = list.filter(
                (t) =>
                    t.title.toLowerCase().includes(q) ||
                    (t.description ?? "").toLowerCase().includes(q)
            );
        }
        return list;
    }, [todos, filter, priorityFilter, search]);

    // ── CRUD handlers ──────────────────────────────────────────────────────────

    const handleCreate = async (data: {
        title: string;
        description: string;
        priority: Priority;
        due_date: string;
    }) => {
        setFormLoading(true);
        try {
            const res = await fetch("/api/todos", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data),
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error ?? "Gagal membuat tugas");
            setTodos((prev) => [result.todo, ...prev]);
            setFormOpen(false);
            showToast("Tugas berhasil ditambahkan! 🎉");
        } catch (err: unknown) {
            showToast(err instanceof Error ? err.message : "Gagal membuat tugas", "error");
        } finally {
            setFormLoading(false);
        }
    };

    const handleEdit = async (data: {
        title: string;
        description: string;
        priority: Priority;
        due_date: string;
    }) => {
        if (!editTarget) return;
        setFormLoading(true);
        try {
            const res = await fetch(`/api/todos/${editTarget.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data),
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error ?? "Gagal mengedit tugas");
            setTodos((prev) =>
                prev.map((t) => (t.id === editTarget.id ? result.todo : t))
            );
            setEditTarget(null);
            showToast("Tugas berhasil diperbarui ✏️");
        } catch (err: unknown) {
            showToast(err instanceof Error ? err.message : "Gagal mengedit tugas", "error");
        } finally {
            setFormLoading(false);
        }
    };

    const handleToggle = async (id: string, is_done: boolean) => {
        setToggling(id);
        // Optimistic update
        setTodos((prev) =>
            prev.map((t) => (t.id === id ? { ...t, is_done } : t))
        );
        try {
            const res = await fetch(`/api/todos/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ is_done }),
            });
            if (!res.ok) {
                // Rollback on error
                setTodos((prev) =>
                    prev.map((t) => (t.id === id ? { ...t, is_done: !is_done } : t))
                );
                showToast("Gagal mengupdate status", "error");
            } else {
                showToast(is_done ? "Tugas selesai! 🎉" : "Tugas dibuka kembali");
            }
        } catch {
            setTodos((prev) =>
                prev.map((t) => (t.id === id ? { ...t, is_done: !is_done } : t))
            );
            showToast("Gagal mengupdate status", "error");
        } finally {
            setToggling(null);
        }
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        setDeleteLoading(true);
        try {
            const res = await fetch(`/api/todos/${deleteTarget}`, { method: "DELETE" });
            if (!res.ok) {
                const result = await res.json();
                throw new Error(result.error ?? "Gagal menghapus tugas");
            }
            setTodos((prev) => prev.filter((t) => t.id !== deleteTarget));
            setDeleteTarget(null);
            showToast("Tugas berhasil dihapus 🗑️");
        } catch (err: unknown) {
            showToast(err instanceof Error ? err.message : "Gagal menghapus", "error");
        } finally {
            setDeleteLoading(false);
        }
    };

    const handleClearDone = async () => {
        const doneIds = todos.filter((t) => t.is_done).map((t) => t.id);
        if (doneIds.length === 0) return;
        // Delete one by one (kita punya few records, ini fine)
        try {
            await Promise.all(
                doneIds.map((id) => fetch(`/api/todos/${id}`, { method: "DELETE" }))
            );
            setTodos((prev) => prev.filter((t) => !t.is_done));
            showToast(`${doneIds.length} tugas selesai dihapus 🧹`);
        } catch {
            showToast("Gagal menghapus sebagian tugas", "error");
        }
    };

    // ── Render ─────────────────────────────────────────────────────────────────

    const doneTodos = todos.filter((t) => t.is_done);

    return (
        <>
            <style>{`
        @keyframes todoModalIn {
          from { opacity: 0; transform: scale(0.95) translateY(8px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes todoToastIn {
          from { opacity: 0; transform: translateY(16px) scale(0.95); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>

            {/* ── Toast ── */}
            {toast && (
                <div
                    className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] px-5 py-3 rounded-2xl shadow-xl text-sm font-semibold text-white flex items-center gap-2
            ${toast.type === "error" ? "bg-red-600" : "bg-[#1a1a2e]"}`}
                    style={{ animation: "todoToastIn 0.25s ease-out both" }}
                >
                    {toast.type === "error" ? "❌" : "✅"} {toast.msg}
                </div>
            )}

            {/* ── Modals ── */}
            <TodoFormModal
                open={formOpen || editTarget !== null}
                onClose={() => { setFormOpen(false); setEditTarget(null); }}
                onSubmit={editTarget ? handleEdit : handleCreate}
                initial={editTarget}
                loading={formLoading}
            />
            <DeleteConfirmModal
                open={deleteTarget !== null}
                onClose={() => setDeleteTarget(null)}
                onConfirm={handleDelete}
                loading={deleteLoading}
            />

            {/* ── Page ── */}
            <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
                <div className="max-w-3xl mx-auto">

                    {/* Header */}
                    <div className="flex items-start justify-between mb-6">
                        <div>
                            <h1 className="text-2xl font-black text-gray-900 tracking-tight">To-Do List</h1>
                            <p className="text-sm text-gray-400 mt-0.5">Catat dan kelola tugasmu di sini</p>
                        </div>
                        <button
                            onClick={() => { setEditTarget(null); setFormOpen(true); }}
                            className="flex items-center gap-2 px-4 py-2.5 bg-[#1a1a2e] hover:bg-[#2d2d4a] text-white text-sm font-semibold rounded-xl transition shadow-md shadow-[#1a1a2e]/20 flex-shrink-0"
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8">
                                <line x1="12" y1="5" x2="12" y2="19" />
                                <line x1="5" y1="12" x2="19" y2="12" />
                            </svg>
                            Tambah Tugas
                        </button>
                    </div>

                    {/* Stats */}
                    {!loading && todos.length > 0 && <StatsBar todos={todos} />}

                    {/* Search + Filters */}
                    <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-4 space-y-3">
                        {/* Search */}
                        <div className="relative">
                            <svg
                                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                                width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
                            >
                                <circle cx="11" cy="11" r="8" />
                                <line x1="21" y1="21" x2="16.65" y2="16.65" />
                            </svg>
                            <input
                                type="text"
                                placeholder="Cari tugas..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e] transition"
                            />
                        </div>

                        {/* Filter tabs + priority */}
                        <div className="flex items-center gap-2 flex-wrap">
                            {(["all", "active", "done"] as FilterType[]).map((f) => (
                                <button
                                    key={f}
                                    onClick={() => setFilter(f)}
                                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition
                    ${filter === f
                                            ? "bg-[#1a1a2e] text-white"
                                            : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                                        }`}
                                >
                                    {f === "all" ? "Semua" : f === "active" ? "Belum Selesai" : "Selesai"}
                                </button>
                            ))}

                            <div className="ml-auto flex items-center gap-2">
                                <select
                                    value={priorityFilter}
                                    onChange={(e) => setPriorityFilter(e.target.value as Priority | "all")}
                                    className="px-3 py-1.5 text-xs font-semibold border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 focus:border-[#1a1a2e] transition bg-white text-gray-600"
                                >
                                    <option value="all">Semua Prioritas</option>
                                    <option value="high">🔴 Tinggi</option>
                                    <option value="medium">🟡 Sedang</option>
                                    <option value="low">🔵 Rendah</option>
                                </select>

                                {doneTodos.length > 0 && (
                                    <button
                                        onClick={handleClearDone}
                                        className="px-3 py-1.5 text-xs font-semibold text-red-500 bg-red-50 hover:bg-red-100 rounded-xl transition"
                                        title="Hapus semua tugas yang sudah selesai"
                                    >
                                        Bersihkan ✅
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Todo List */}
                    <div className="space-y-2">
                        {loading ? (
                            <div className="space-y-2">
                                {[1, 2, 3].map((i) => (
                                    <div
                                        key={i}
                                        className="h-20 bg-white border border-gray-100 rounded-2xl animate-pulse"
                                        style={{ animationDelay: `${i * 60}ms` }}
                                    />
                                ))}
                            </div>
                        ) : error ? (
                            <div className="bg-red-50 border border-red-100 rounded-2xl p-5 text-center">
                                <p className="text-sm text-red-600 font-semibold mb-3">{error}</p>
                                <button
                                    onClick={fetchTodos}
                                    className="px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-xl transition"
                                >
                                    Coba Lagi
                                </button>
                            </div>
                        ) : filteredTodos.length === 0 ? (
                            <div className="bg-white border border-gray-100 rounded-2xl">
                                <EmptyState filter={filter} />
                            </div>
                        ) : (
                            filteredTodos.map((todo) => (
                                <div
                                    key={todo.id}
                                    style={{ animation: "todoModalIn 0.2s ease-out both" }}
                                >
                                    <TodoItem
                                        todo={todo}
                                        onToggle={handleToggle}
                                        onEdit={(t) => { setEditTarget(t); setFormOpen(false); }}
                                        onDelete={(id) => setDeleteTarget(id)}
                                        toggling={toggling}
                                    />
                                </div>
                            ))
                        )}
                    </div>

                    {/* Footer info */}
                    {!loading && filteredTodos.length > 0 && (
                        <p className="text-xs text-gray-400 text-center mt-6">
                            Menampilkan {filteredTodos.length} dari {todos.length} tugas
                        </p>
                    )}
                </div>
            </div>
        </>
    );
}