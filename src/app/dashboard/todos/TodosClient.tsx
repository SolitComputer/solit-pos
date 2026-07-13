"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";

// ─── Types ────────────────────────────────────────────────────────────────────

type Priority = "low" | "medium" | "high";
type FilterType = "all" | "active" | "done";

interface TodoItem {
    id: string;
    todo_id: string;
    user_id: string;
    title: string;
    is_done: boolean;
    position: number;
    created_at: string;
}

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
    // items di-load secara lazy saat expand
    items?: TodoItem[];
    items_loaded?: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PRIORITY_CONFIG: Record<
    Priority,
    { label: string; color: string; bg: string; dot: string; bar: string; badge: string }
> = {
    high: {
        label: "Tinggi",
        color: "text-red-700",
        bg: "bg-red-50 border-red-200",
        dot: "bg-red-500",
        bar: "bg-red-500",
        badge: "bg-red-100 text-red-700 border-red-200",
    },
    medium: {
        label: "Sedang",
        color: "text-amber-700",
        bg: "bg-amber-50 border-amber-200",
        dot: "bg-amber-400",
        bar: "bg-amber-400",
        badge: "bg-amber-100 text-amber-700 border-amber-200",
    },
    low: {
        label: "Rendah",
        color: "text-sky-700",
        bg: "bg-sky-50 border-sky-200",
        dot: "bg-sky-400",
        bar: "bg-sky-400",
        badge: "bg-sky-100 text-sky-700 border-sky-200",
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

function getItemProgress(items: TodoItem[] | undefined): number | null {
    if (!items || items.length === 0) return null;
    const done = items.filter((i) => i.is_done).length;
    return Math.round((done / items.length) * 100);
}

// ─── EmptyState ───────────────────────────────────────────────────────────────

function EmptyState({ filter }: { filter: FilterType }) {
    const messages: Record<FilterType, { icon: string; title: string; desc: string }> = {
        all: { icon: "✦", title: "Belum ada tugas", desc: "Tambah tugas pertamamu sekarang" },
        active: { icon: "✓", title: "Semua tugas selesai!", desc: "Tidak ada tugas yang tertunda" },
        done: { icon: "◎", title: "Belum ada tugas selesai", desc: "Selesaikan tugas dan centang di sini" },
    };
    const { icon, title, desc } = messages[filter];
    return (
        <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-[#1a1a2e]/5 flex items-center justify-center mb-4">
                <span className="text-2xl text-[#1a1a2e]/40 font-light">{icon}</span>
            </div>
            <p className="text-sm font-semibold text-gray-700 mt-1">{title}</p>
            <p className="text-xs text-gray-400 mt-1">{desc}</p>
        </div>
    );
}

// ─── TodoFormModal ────────────────────────────────────────────────────────────

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
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-md p-4"
            onClick={(e) => e.target === e.currentTarget && onClose()}
        >
            <div
                className="bg-white rounded-3xl shadow-2xl w-full max-w-md border border-gray-100"
                style={{ animation: "todoModalIn 0.22s cubic-bezier(0.34,1.56,0.64,1) both" }}
            >
                <div className="flex items-center justify-between px-6 pt-6 pb-5">
                    <div>
                        <h2 className="text-base font-bold text-gray-900">
                            {initial ? "Edit Tugas" : "Tambah Tugas Baru"}
                        </h2>
                        <p className="text-xs text-gray-400 mt-0.5">
                            {initial ? "Perbarui detail tugas ini" : "Isi detail tugas yang ingin ditambahkan"}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-all"
                    >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>

                <div className="h-px bg-gray-100 mx-6" />

                <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
                    <div>
                        <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">
                            Judul Tugas <span className="text-red-400 normal-case tracking-normal">*</span>
                        </label>
                        <input
                            ref={titleRef}
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="Contoh: Fix bug halaman pembayaran"
                            maxLength={200}
                            required
                            className="w-full px-4 py-3 text-sm border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/15 focus:border-[#1a1a2e] transition-all placeholder:text-gray-300 bg-gray-50/50"
                        />
                    </div>

                    <div>
                        <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">
                            Deskripsi <span className="text-gray-300 font-normal normal-case tracking-normal">(opsional)</span>
                        </label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Detail tambahan tentang tugas ini..."
                            rows={3}
                            maxLength={1000}
                            className="w-full px-4 py-3 text-sm border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/15 focus:border-[#1a1a2e] transition-all resize-none placeholder:text-gray-300 bg-gray-50/50"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">
                                Prioritas
                            </label>
                            <select
                                value={priority}
                                onChange={(e) => setPriority(e.target.value as Priority)}
                                className="w-full px-4 py-3 text-sm border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/15 focus:border-[#1a1a2e] transition-all bg-gray-50/50 cursor-pointer"
                            >
                                <option value="high">🔴 Tinggi</option>
                                <option value="medium">🟡 Sedang</option>
                                <option value="low">🔵 Rendah</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">
                                Deadline <span className="text-gray-300 font-normal normal-case tracking-normal">(opsional)</span>
                            </label>
                            <input
                                type="date"
                                value={dueDate}
                                onChange={(e) => setDueDate(e.target.value)}
                                className="w-full px-4 py-3 text-sm border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/15 focus:border-[#1a1a2e] transition-all bg-gray-50/50"
                            />
                        </div>
                    </div>

                    <div className="flex gap-2 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={loading}
                            className="flex-1 px-4 py-3 text-sm font-semibold text-gray-500 bg-gray-100 hover:bg-gray-200 rounded-2xl transition-all hover:text-gray-700"
                        >
                            Batal
                        </button>
                        <button
                            type="submit"
                            disabled={loading || !title.trim()}
                            className="flex-1 px-4 py-3 text-sm font-semibold text-white bg-[#1a1a2e] hover:bg-[#252540] rounded-2xl transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-[#1a1a2e]/20"
                        >
                            {loading ? (
                                <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                    <path d="M21 12a9 9 0 11-6.219-8.56" />
                                </svg>
                            ) : (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                    {initial
                                        ? <><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v14z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" /></>
                                        : <><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>
                                    }
                                </svg>
                            )}
                            {initial ? "Simpan Perubahan" : "Tambah Tugas"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// ─── ChecklistPanel ───────────────────────────────────────────────────────────

interface ChecklistPanelProps {
    todo: Todo;
    onItemsChange: (todoId: string, items: TodoItem[]) => void;
    showToast: (msg: string, type?: "success" | "error") => void;
}

function ChecklistPanel({ todo, onItemsChange, showToast }: ChecklistPanelProps) {
    const [newItemTitle, setNewItemTitle] = useState("");
    const [adding, setAdding] = useState(false);
    const [togglingId, setTogglingId] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingTitle, setEditingTitle] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);

    const items = todo.items ?? [];

    const handleAddItem = async () => {
        const title = newItemTitle.trim();
        if (!title) return;
        setAdding(true);
        try {
            const res = await fetch(`/api/todos/${todo.id}/items`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title }),
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error ?? "Gagal menambah item");
            onItemsChange(todo.id, [...items, result.item]);
            setNewItemTitle("");
            setTimeout(() => inputRef.current?.focus(), 50);
        } catch (err: unknown) {
            showToast(err instanceof Error ? err.message : "Gagal menambah item", "error");
        } finally {
            setAdding(false);
        }
    };

    const handleToggleItem = async (item: TodoItem) => {
        setTogglingId(item.id);
        // Optimistic update
        onItemsChange(todo.id, items.map((i) => i.id === item.id ? { ...i, is_done: !item.is_done } : i));
        try {
            const res = await fetch(`/api/todos/${todo.id}/items/${item.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ is_done: !item.is_done }),
            });
            if (!res.ok) {
                // rollback
                onItemsChange(todo.id, items.map((i) => i.id === item.id ? { ...i, is_done: item.is_done } : i));
                showToast("Gagal mengupdate item", "error");
            }
        } catch {
            onItemsChange(todo.id, items.map((i) => i.id === item.id ? { ...i, is_done: item.is_done } : i));
            showToast("Gagal mengupdate item", "error");
        } finally {
            setTogglingId(null);
        }
    };

    const handleDeleteItem = async (itemId: string) => {
        setDeletingId(itemId);
        try {
            const res = await fetch(`/api/todos/${todo.id}/items/${itemId}`, { method: "DELETE" });
            if (!res.ok) {
                const result = await res.json();
                throw new Error(result.error ?? "Gagal menghapus item");
            }
            onItemsChange(todo.id, items.filter((i) => i.id !== itemId));
        } catch (err: unknown) {
            showToast(err instanceof Error ? err.message : "Gagal menghapus item", "error");
        } finally {
            setDeletingId(null);
        }
    };

    const handleEditItem = async (itemId: string) => {
        const title = editingTitle.trim();
        if (!title) return;
        try {
            const res = await fetch(`/api/todos/${todo.id}/items/${itemId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title }),
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error ?? "Gagal mengedit item");
            onItemsChange(todo.id, items.map((i) => i.id === itemId ? { ...i, title } : i));
            setEditingId(null);
        } catch (err: unknown) {
            showToast(err instanceof Error ? err.message : "Gagal mengedit item", "error");
        }
    };

    const doneCount = items.filter((i) => i.is_done).length;
    const pct = items.length > 0 ? Math.round((doneCount / items.length) * 100) : 0;

    return (
        <div className="mt-3 pt-3 border-t border-gray-100">
            {/* Mini progress bar */}
            {items.length > 0 && (
                <div className="flex items-center gap-2 mb-3">
                    <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden">
                        <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                                width: `${pct}%`,
                                background: pct === 100 ? "#10b981" : "#1a1a2e",
                            }}
                        />
                    </div>
                    <span className={`text-[10px] font-black min-w-[32px] text-right ${pct === 100 ? "text-emerald-600" : "text-[#1a1a2e]"}`}>
                        {pct}%
                    </span>
                    <span className="text-[10px] text-gray-400">{doneCount}/{items.length}</span>
                </div>
            )}

            {/* Item list */}
            <div className="space-y-1">
                {items.map((item, idx) => (
                    <div key={item.id} className="group/item flex items-center gap-2 py-1">
                        {/* Nomor urut */}
                        <span className="text-[10px] text-gray-300 font-bold w-4 text-center flex-shrink-0 select-none">
                            {idx + 1}
                        </span>

                        {/* Checkbox item */}
                        <button
                            onClick={() => handleToggleItem(item)}
                            disabled={togglingId === item.id}
                            className={`flex-shrink-0 w-4 h-4 rounded border-[1.5px] flex items-center justify-center transition-all duration-150
                                ${item.is_done
                                    ? "bg-emerald-500 border-emerald-500"
                                    : "border-gray-300 hover:border-[#1a1a2e]"
                                }
                                ${togglingId === item.id ? "opacity-50 animate-pulse" : ""}
                            `}
                            aria-label={item.is_done ? "Batalkan" : "Selesaikan"}
                        >
                            {item.is_done && (
                                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5">
                                    <polyline points="20 6 9 17 4 12" />
                                </svg>
                            )}
                        </button>

                        {/* Title or edit input */}
                        {editingId === item.id ? (
                            <div className="flex-1 flex items-center gap-1">
                                <input
                                    autoFocus
                                    type="text"
                                    value={editingTitle}
                                    onChange={(e) => setEditingTitle(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") handleEditItem(item.id);
                                        if (e.key === "Escape") setEditingId(null);
                                    }}
                                    className="flex-1 text-xs px-2 py-1 border border-[#1a1a2e]/30 rounded-lg focus:outline-none focus:border-[#1a1a2e] bg-white"
                                    maxLength={300}
                                />
                                <button
                                    onClick={() => handleEditItem(item.id)}
                                    className="w-6 h-6 rounded-lg bg-[#1a1a2e] flex items-center justify-center text-white"
                                >
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                        <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                </button>
                                <button
                                    onClick={() => setEditingId(null)}
                                    className="w-6 h-6 rounded-lg bg-gray-100 flex items-center justify-center text-gray-500"
                                >
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                                    </svg>
                                </button>
                            </div>
                        ) : (
                            <span
                                className={`flex-1 text-xs leading-snug select-none ${item.is_done ? "line-through text-gray-400" : "text-gray-700"}`}
                            >
                                {item.title}
                            </span>
                        )}

                        {/* Item actions (hover) */}
                        {editingId !== item.id && (
                            <div className="flex items-center gap-0.5 opacity-0 group-hover/item:opacity-100 transition-opacity flex-shrink-0">
                                <button
                                    onClick={() => { setEditingId(item.id); setEditingTitle(item.title); }}
                                    className="w-6 h-6 rounded-lg flex items-center justify-center text-gray-300 hover:text-[#1a1a2e] hover:bg-gray-100 transition-all"
                                    title="Edit"
                                >
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                                        <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                                        <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                                    </svg>
                                </button>
                                <button
                                    onClick={() => handleDeleteItem(item.id)}
                                    disabled={deletingId === item.id}
                                    className="w-6 h-6 rounded-lg flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all"
                                    title="Hapus"
                                >
                                    {deletingId === item.id ? (
                                        <svg className="animate-spin" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                            <path d="M21 12a9 9 0 11-6.219-8.56" />
                                        </svg>
                                    ) : (
                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                                            <polyline points="3 6 5 6 21 6" />
                                            <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2" />
                                        </svg>
                                    )}
                                </button>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* Add item input */}
            <div className="flex items-center gap-2 mt-2">
                <span className="w-4 flex-shrink-0" />
                <div className="flex-1 flex items-center gap-1.5">
                    <div className="flex-shrink-0 w-4 h-4 rounded border-[1.5px] border-dashed border-gray-300" />
                    <input
                        ref={inputRef}
                        type="text"
                        placeholder="Tambah sub-task..."
                        value={newItemTitle}
                        onChange={(e) => setNewItemTitle(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") handleAddItem(); }}
                        maxLength={300}
                        className="flex-1 text-xs text-gray-600 placeholder:text-gray-300 bg-transparent focus:outline-none py-1"
                    />
                    {newItemTitle.trim() && (
                        <button
                            onClick={handleAddItem}
                            disabled={adding}
                            className="flex-shrink-0 px-2.5 py-1 text-[10px] font-bold text-white bg-[#1a1a2e] hover:bg-[#252540] rounded-lg transition-all disabled:opacity-50"
                        >
                            {adding ? "..." : "Tambah"}
                        </button>
                    )}
                </div>
            </div>

            {items.length === 0 && !newItemTitle && (
                <p className="text-[10px] text-gray-400 mt-1.5 pl-6">
                    Belum ada sub-task. Ketik di atas untuk menambah.
                </p>
            )}
        </div>
    );
}

// ─── TodoItemCard ─────────────────────────────────────────────────────────────

interface TodoItemCardProps {
    todo: Todo;
    onToggle: (id: string, is_done: boolean) => void;
    onEdit: (todo: Todo) => void;
    onDelete: (id: string) => void;
    onExpand: (id: string) => void;
    onItemsChange: (todoId: string, items: TodoItem[]) => void;
    toggling: string | null;
    expanded: boolean;
    loadingItems: boolean;
    showToast: (msg: string, type?: "success" | "error") => void;
}

function TodoItemCard({
    todo, onToggle, onEdit, onDelete, onExpand,
    onItemsChange, toggling, expanded, loadingItems, showToast,
}: TodoItemCardProps) {
    const overdue = isOverdue(todo.due_date, todo.is_done);
    const dueToday = isDueToday(todo.due_date, todo.is_done);
    const cfg = PRIORITY_CONFIG[todo.priority];
    const isToggling = toggling === todo.id;
    const progress = getItemProgress(todo.items);
    const hasItems = (todo.items?.length ?? 0) > 0;

    return (
        <div
            className={`group relative rounded-2xl border transition-all duration-200
                ${todo.is_done
                    ? "bg-gray-50/80 border-gray-100 opacity-60"
                    : "bg-white border-gray-100 hover:border-gray-200 hover:shadow-[0_2px_12px_rgba(0,0,0,0.06)]"
                }`}
        >
            {/* Priority Bar */}
            <div
                className={`absolute left-0 top-4 bottom-4 w-[3px] rounded-r-full transition-opacity ${cfg.bar} ${todo.is_done ? "opacity-20" : "opacity-80"}`}
            />

            <div className="flex items-start gap-4 px-5 py-4">
                {/* Expand toggle — chevron button */}
                <button
                    onClick={() => onExpand(todo.id)}
                    className={`flex-shrink-0 mt-0.5 w-5 h-5 rounded flex items-center justify-center transition-all duration-200
                        ${expanded ? "bg-[#1a1a2e]/8 text-[#1a1a2e]" : "text-gray-300 hover:text-gray-500 hover:bg-gray-100"}`}
                    aria-label={expanded ? "Tutup checklist" : "Buka checklist"}
                    title="Sub-tasks"
                >
                    {loadingItems ? (
                        <svg className="animate-spin" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M21 12a9 9 0 11-6.219-8.56" />
                        </svg>
                    ) : (
                        <svg
                            width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                            className={`transition-transform duration-200 ${expanded ? "rotate-90" : ""}`}
                        >
                            <polyline points="9 18 15 12 9 6" />
                        </svg>
                    )}
                </button>

                {/* Todo done checkbox */}
                <button
                    onClick={() => onToggle(todo.id, !todo.is_done)}
                    disabled={isToggling}
                    className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all duration-200
                        ${todo.is_done
                            ? "bg-emerald-500 border-emerald-500"
                            : "border-gray-300 hover:border-[#1a1a2e] hover:bg-[#1a1a2e]/5"
                        }
                        ${isToggling ? "opacity-50 animate-pulse" : ""}`}
                    aria-label={todo.is_done ? "Tandai belum selesai" : "Tandai selesai"}
                >
                    {todo.is_done && (
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5">
                            <polyline points="20 6 9 17 4 12" />
                        </svg>
                    )}
                </button>

                {/* Content */}
                <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold leading-snug break-words ${todo.is_done ? "line-through text-gray-400" : "text-gray-800"}`}>
                        {todo.title}
                    </p>
                    {todo.description && (
                        <p className={`text-xs mt-1.5 leading-relaxed break-words ${todo.is_done ? "text-gray-400" : "text-gray-500"}`}>
                            {todo.description}
                        </p>
                    )}

                    {/* Item progress mini bar (collapsed state) */}
                    {hasItems && !expanded && progress !== null && (
                        <div className="flex items-center gap-2 mt-2">
                            <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden max-w-[120px]">
                                <div
                                    className="h-full rounded-full transition-all duration-500"
                                    style={{
                                        width: `${progress}%`,
                                        background: progress === 100 ? "#10b981" : "#1a1a2e",
                                    }}
                                />
                            </div>
                            <span className={`text-[10px] font-bold ${progress === 100 ? "text-emerald-600" : "text-gray-500"}`}>
                                {progress}%
                            </span>
                            <span className="text-[10px] text-gray-400">
                                {todo.items!.filter(i => i.is_done).length}/{todo.items!.length} sub-task
                            </span>
                        </div>
                    )}

                    {/* Badges */}
                    <div className="flex items-center flex-wrap gap-1.5 mt-2.5">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg border ${cfg.badge}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                            {cfg.label}
                        </span>
                        {todo.due_date && (
                            <span
                                className={`text-[10px] font-semibold px-2 py-1 rounded-lg border flex items-center gap-1
                                    ${overdue
                                        ? "bg-red-50 text-red-600 border-red-200"
                                        : dueToday
                                            ? "bg-orange-50 text-orange-600 border-orange-200"
                                            : "bg-gray-50 text-gray-500 border-gray-100"
                                    }`}
                            >
                                {overdue ? (
                                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                        <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                                    </svg>
                                ) : dueToday ? (
                                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" />
                                    </svg>
                                ) : (
                                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                        <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                                    </svg>
                                )}
                                {overdue ? "Terlambat · " : dueToday ? "Hari ini · " : ""}
                                {formatDate(todo.due_date)}
                            </span>
                        )}
                        {/* Sub-task count badge */}
                        {(todo.items_loaded && (todo.items?.length ?? 0) > 0) && (
                            <span className="text-[10px] font-semibold px-2 py-1 rounded-lg border bg-[#1a1a2e]/5 text-[#1a1a2e]/60 border-[#1a1a2e]/10 flex items-center gap-1">
                                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                    <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
                                    <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
                                </svg>
                                {todo.items!.filter(i => i.is_done).length}/{todo.items!.length}
                            </span>
                        )}
                    </div>
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all duration-150 flex-shrink-0 mt-0.5">
                    <button
                        onClick={() => onEdit(todo)}
                        className="w-7 h-7 rounded-xl flex items-center justify-center text-gray-400 hover:text-[#1a1a2e] hover:bg-gray-100 transition-all"
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
                        className="w-7 h-7 rounded-xl flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all"
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

            {/* Checklist panel (expandable) */}
            {expanded && (
                <div className="px-5 pb-4">
                    <ChecklistPanel
                        todo={todo}
                        onItemsChange={onItemsChange}
                        showToast={showToast}
                    />
                </div>
            )}
        </div>
    );
}

// ─── StatsBar ─────────────────────────────────────────────────────────────────

function StatsBar({ todos }: { todos: Todo[] }) {
    const total = todos.length;
    const done = todos.filter((t) => t.is_done).length;
    const overdue = todos.filter((t) => isOverdue(t.due_date, t.is_done)).length;
    const dueToday = todos.filter((t) => isDueToday(t.due_date, t.is_done)).length;
    const pct = total === 0 ? 0 : Math.round((done / total) * 100);

    const stats = [
        {
            label: "Total Tugas",
            value: total,
            icon: (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
                </svg>
            ),
            iconBg: "bg-[#1a1a2e]/8",
            iconColor: "text-[#1a1a2e]",
            valueColor: "text-gray-900",
        },
        {
            label: "Selesai",
            value: done,
            icon: (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="20 6 9 17 4 12" />
                </svg>
            ),
            iconBg: "bg-emerald-50",
            iconColor: "text-emerald-600",
            valueColor: "text-emerald-600",
        },
        {
            label: "Jatuh Tempo",
            value: dueToday,
            icon: (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                </svg>
            ),
            iconBg: "bg-orange-50",
            iconColor: "text-orange-500",
            valueColor: "text-orange-600",
        },
        {
            label: "Terlambat",
            value: overdue,
            icon: (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
            ),
            iconBg: "bg-red-50",
            iconColor: "text-red-500",
            valueColor: "text-red-600",
        },
    ];

    return (
        <div className="mb-6 space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {stats.map(({ label, value, icon, iconBg, iconColor, valueColor }) => (
                    <div key={label} className="bg-white rounded-2xl border border-gray-100 px-4 py-3.5 flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${iconBg} ${iconColor}`}>
                            {icon}
                        </div>
                        <div className="min-w-0">
                            <p className={`text-xl font-black leading-none ${valueColor}`}>{value}</p>
                            <p className="text-[10px] text-gray-400 font-medium mt-1 leading-tight">{label}</p>
                        </div>
                    </div>
                ))}
            </div>

            {total > 0 && (
                <div className="bg-white rounded-2xl border border-gray-100 px-5 py-4">
                    <div className="flex justify-between items-center mb-2.5">
                        <div className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            <p className="text-xs font-semibold text-gray-700">Progress Keseluruhan</p>
                        </div>
                        <p className="text-xs font-black text-emerald-600">{pct}%</p>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                            className="h-full rounded-full transition-all duration-700 ease-out"
                            style={{
                                width: `${pct}%`,
                                background: "linear-gradient(90deg, #10b981, #059669)",
                            }}
                        />
                    </div>
                    <p className="text-[10px] text-gray-400 mt-2">{done} dari {total} tugas selesai</p>
                </div>
            )}
        </div>
    );
}

// ─── DeleteConfirmModal ───────────────────────────────────────────────────────

function DeleteConfirmModal({
    open, onClose, onConfirm, loading,
}: {
    open: boolean;
    onClose: () => void;
    onConfirm: () => void;
    loading: boolean;
}) {
    if (!open) return null;
    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-md p-4"
            onClick={(e) => e.target === e.currentTarget && onClose()}
        >
            <div
                className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6 border border-gray-100"
                style={{ animation: "todoModalIn 0.22s cubic-bezier(0.34,1.56,0.64,1) both" }}
            >
                <div className="text-center mb-6">
                    <div className="w-14 h-14 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2" />
                        </svg>
                    </div>
                    <h3 className="text-base font-bold text-gray-900">Hapus Tugas?</h3>
                    <p className="text-sm text-gray-400 mt-1.5 leading-relaxed">
                        Tugas dan semua sub-task di dalamnya akan dihapus permanen.
                    </p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={onClose}
                        disabled={loading}
                        className="flex-1 px-4 py-3 text-sm font-semibold text-gray-500 bg-gray-100 hover:bg-gray-200 rounded-2xl transition-all"
                    >
                        Batal
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={loading}
                        className="flex-1 px-4 py-3 text-sm font-semibold text-white bg-red-500 hover:bg-red-600 rounded-2xl transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-red-500/20"
                    >
                        {loading && (
                            <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <path d="M21 12a9 9 0 11-6.219-8.56" />
                            </svg>
                        )}
                        Hapus Tugas
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

    const [formOpen, setFormOpen] = useState(false);
    const [editTarget, setEditTarget] = useState<Todo | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
    const [formLoading, setFormLoading] = useState(false);
    const [deleteLoading, setDeleteLoading] = useState(false);
    const [toggling, setToggling] = useState<string | null>(null);

    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    const [loadingItemsIds, setLoadingItemsIds] = useState<Set<string>>(new Set());

    const [filter, setFilter] = useState<FilterType>("all");
    const [search, setSearch] = useState("");
    const [priorityFilter, setPriorityFilter] = useState<Priority | "all">("all");

    const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
    const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const showToast = useCallback((msg: string, type: "success" | "error" = "success") => {
        if (toastTimer.current) clearTimeout(toastTimer.current);
        setToast({ msg, type });
        toastTimer.current = setTimeout(() => setToast(null), 3000);
    }, []);

    const fetchTodos = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/todos");
            if (!res.ok) throw new Error("Gagal memuat tugas");
            const data = await res.json();
            setTodos(data.todos ?? []);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Terjadi kesalahan");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchTodos(); }, [fetchTodos]);

    const handleExpand = useCallback(async (todoId: string) => {
        const isExpanded = expandedIds.has(todoId);

        if (isExpanded) {
            setExpandedIds((prev) => {
                const next = new Set(prev);
                next.delete(todoId);
                return next;
            });
            return;
        }

        const todo = todos.find((t) => t.id === todoId);
        if (todo?.items_loaded) {
            setExpandedIds((prev) => new Set(prev).add(todoId));
            return;
        }

        setLoadingItemsIds((prev) => new Set(prev).add(todoId));
        try {
            const res = await fetch(`/api/todos/${todoId}/items`);
            const data = await res.json();
            setTodos((prev) =>
                prev.map((t) =>
                    t.id === todoId
                        ? { ...t, items: data.items ?? [], items_loaded: true }
                        : t
                )
            );
            setExpandedIds((prev) => new Set(prev).add(todoId));
        } catch {
            showToast("Gagal memuat sub-task", "error");
        } finally {
            setLoadingItemsIds((prev) => {
                const next = new Set(prev);
                next.delete(todoId);
                return next;
            });
        }
    }, [expandedIds, todos, showToast]);

    const handleItemsChange = useCallback((todoId: string, items: TodoItem[]) => {
        setTodos((prev) =>
            prev.map((t) => t.id === todoId ? { ...t, items, items_loaded: true } : t)
        );
    }, []);

    const filteredTodos = useMemo(() => {
        let list = todos;
        if (filter === "active") list = list.filter((t) => !t.is_done);
        if (filter === "done") list = list.filter((t) => t.is_done);
        if (priorityFilter !== "all") list = list.filter((t) => t.priority === priorityFilter);
        if (search.trim()) {
            const q = search.toLowerCase();
            list = list.filter((t) =>
                t.title.toLowerCase().includes(q) ||
                (t.description ?? "").toLowerCase().includes(q)
            );
        }
        return list;
    }, [todos, filter, priorityFilter, search]);

    const handleCreate = async (data: { title: string; description: string; priority: Priority; due_date: string }) => {
        setFormLoading(true);
        try {
            const res = await fetch("/api/todos", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data),
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error ?? "Gagal membuat tugas");
            setTodos((prev) => [{ ...result.todo, items: [], items_loaded: true }, ...prev]);
            setFormOpen(false);
            showToast("Tugas berhasil ditambahkan!");
        } catch (err: unknown) {
            showToast(err instanceof Error ? err.message : "Gagal membuat tugas", "error");
        } finally {
            setFormLoading(false);
        }
    };

    const handleEdit = async (data: { title: string; description: string; priority: Priority; due_date: string }) => {
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
                prev.map((t) =>
                    t.id === editTarget.id
                        ? { ...result.todo, items: t.items, items_loaded: t.items_loaded }
                        : t
                )
            );
            setEditTarget(null);
            showToast("Tugas berhasil diperbarui");
        } catch (err: unknown) {
            showToast(err instanceof Error ? err.message : "Gagal mengedit tugas", "error");
        } finally {
            setFormLoading(false);
        }
    };

    const handleToggle = async (id: string, is_done: boolean) => {
        setToggling(id);
        setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, is_done } : t)));
        try {
            const res = await fetch(`/api/todos/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ is_done }),
            });
            if (!res.ok) {
                setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, is_done: !is_done } : t)));
                showToast("Gagal mengupdate status", "error");
            } else {
                showToast(is_done ? "Tugas selesai!" : "Tugas dibuka kembali");
            }
        } catch {
            setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, is_done: !is_done } : t)));
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
            setExpandedIds((prev) => {
                const next = new Set(prev);
                next.delete(deleteTarget);
                return next;
            });
            setDeleteTarget(null);
            showToast("Tugas berhasil dihapus");
        } catch (err: unknown) {
            showToast(err instanceof Error ? err.message : "Gagal menghapus", "error");
        } finally {
            setDeleteLoading(false);
        }
    };

    const handleClearDone = async () => {
        const doneIds = todos.filter((t) => t.is_done).map((t) => t.id);
        if (doneIds.length === 0) return;
        try {
            await Promise.all(doneIds.map((id) => fetch(`/api/todos/${id}`, { method: "DELETE" })));
            setTodos((prev) => prev.filter((t) => !t.is_done));
            setExpandedIds((prev) => {
                const next = new Set(prev);
                doneIds.forEach((id) => next.delete(id));
                return next;
            });
            showToast(`${doneIds.length} tugas selesai dihapus`);
        } catch {
            showToast("Gagal menghapus sebagian tugas", "error");
        }
    };

    const doneTodos = todos.filter((t) => t.is_done);

    const content = (
        <>
            <style>{`
                @keyframes todoModalIn {
                    from { opacity: 0; transform: scale(0.94) translateY(10px); }
                    to   { opacity: 1; transform: scale(1) translateY(0); }
                }
                @keyframes todoToastIn {
                    from { opacity: 0; transform: translateX(-50%) translateY(12px) scale(0.96); }
                    to   { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
                }
                @keyframes todoItemIn {
                    from { opacity: 0; transform: translateY(6px); }
                    to   { opacity: 1; transform: translateY(0); }
                }
                @keyframes todoPulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.4; }
                }
            `}</style>

            {toast && (
                <div
                    className={`fixed bottom-6 left-1/2 z-[100] flex items-center gap-2.5 px-5 py-3 rounded-2xl shadow-2xl text-sm font-semibold text-white
                        ${toast.type === "error" ? "bg-red-500" : "bg-[#1a1a2e]"}`}
                    style={{ animation: "todoToastIn 0.25s ease-out both", transform: "translateX(-50%)" }}
                >
                    {toast.type === "error" ? (
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
                        </svg>
                    ) : (
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <polyline points="20 6 9 17 4 12" />
                        </svg>
                    )}
                    {toast.msg}
                </div>
            )}

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

            <div className="max-w-3xl mx-auto">
                <div className="flex items-start justify-between mb-7">
                    <div>
                        <div className="flex items-center gap-2.5 mb-1">
                            <div className="w-7 h-7 bg-[#1a1a2e] rounded-lg flex items-center justify-center">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2">
                                    <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
                                </svg>
                            </div>
                            <h1 className="text-xl font-black text-gray-900 tracking-tight">To-Do List</h1>
                        </div>
                        <p className="text-sm text-gray-400 ml-9">Catat dan kelola tugas harianmu</p>
                    </div>
                    <button
                        onClick={() => { setEditTarget(null); setFormOpen(true); }}
                        className="flex items-center gap-2 px-4 py-2.5 bg-[#1a1a2e] hover:bg-[#252540] text-white text-sm font-semibold rounded-2xl transition-all shadow-lg shadow-[#1a1a2e]/20 flex-shrink-0 active:scale-95"
                    >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8">
                            <line x1="12" y1="5" x2="12" y2="19" />
                            <line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                        Tambah Tugas
                    </button>
                </div>

                {!loading && todos.length > 0 && <StatsBar todos={todos} />}

                <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-4 space-y-3">
                    <div className="relative">
                        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-300">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                                <circle cx="11" cy="11" r="8" />
                                <line x1="21" y1="21" x2="16.65" y2="16.65" />
                            </svg>
                        </div>
                        <input
                            type="text"
                            placeholder="Cari tugas..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/15 focus:border-[#1a1a2e] transition-all bg-gray-50/50 placeholder:text-gray-300"
                        />
                        {search && (
                            <button
                                onClick={() => setSearch("")}
                                className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center text-gray-500 transition-all"
                            >
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                                </svg>
                            </button>
                        )}
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                        <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-xl">
                            {(["all", "active", "done"] as FilterType[]).map((f) => (
                                <button
                                    key={f}
                                    onClick={() => setFilter(f)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all
                                        ${filter === f
                                            ? "bg-white text-gray-900 shadow-sm"
                                            : "text-gray-500 hover:text-gray-700"
                                        }`}
                                >
                                    {f === "all" ? "Semua" : f === "active" ? "Aktif" : "Selesai"}
                                </button>
                            ))}
                        </div>

                        <div className="ml-auto flex items-center gap-2">
                            <select
                                value={priorityFilter}
                                onChange={(e) => setPriorityFilter(e.target.value as Priority | "all")}
                                className="px-3 py-2 text-xs font-semibold border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/15 focus:border-[#1a1a2e] transition-all bg-white text-gray-600 cursor-pointer"
                            >
                                <option value="all">Semua Prioritas</option>
                                <option value="high">🔴 Tinggi</option>
                                <option value="medium">🟡 Sedang</option>
                                <option value="low">🔵 Rendah</option>
                            </select>

                            {doneTodos.length > 0 && (
                                <button
                                    onClick={handleClearDone}
                                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-red-500 bg-red-50 hover:bg-red-100 rounded-xl transition-all border border-red-100"
                                >
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                        <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2" />
                                    </svg>
                                    Bersihkan ({doneTodos.length})
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                <div className="space-y-2">
                    {loading ? (
                        <div className="space-y-2">
                            {[1, 2, 3].map((i) => (
                                <div
                                    key={i}
                                    className="h-[76px] bg-white border border-gray-100 rounded-2xl"
                                    style={{ animation: `todoPulse 1.5s ease-in-out ${i * 150}ms infinite` }}
                                />
                            ))}
                        </div>
                    ) : error ? (
                        <div className="bg-red-50 border border-red-100 rounded-2xl p-6 text-center">
                            <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
                                    <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                                </svg>
                            </div>
                            <p className="text-sm text-red-600 font-semibold mb-3">{error}</p>
                            <button
                                onClick={fetchTodos}
                                className="px-4 py-2 text-xs font-semibold text-white bg-red-500 hover:bg-red-600 rounded-xl transition-all shadow-sm"
                            >
                                Coba Lagi
                            </button>
                        </div>
                    ) : filteredTodos.length === 0 ? (
                        <div className="bg-white border border-gray-100 rounded-2xl">
                            <EmptyState filter={filter} />
                        </div>
                    ) : (
                        filteredTodos.map((todo, i) => (
                            <div
                                key={todo.id}
                                style={{ animation: `todoItemIn 0.2s ease-out ${i * 30}ms both` }}
                            >
                                <TodoItemCard
                                    todo={todo}
                                    onToggle={handleToggle}
                                    onEdit={(t) => { setEditTarget(t); setFormOpen(false); }}
                                    onDelete={(id) => setDeleteTarget(id)}
                                    onExpand={handleExpand}
                                    onItemsChange={handleItemsChange}
                                    toggling={toggling}
                                    expanded={expandedIds.has(todo.id)}
                                    loadingItems={loadingItemsIds.has(todo.id)}
                                    showToast={showToast}
                                />
                            </div>
                        ))
                    )}
                </div>

                {!loading && filteredTodos.length > 0 && (
                    <div className="flex items-center justify-center gap-2 mt-6">
                        <div className="h-px bg-gray-100 flex-1" />
                        <p className="text-xs text-gray-400 font-medium px-3">
                            {filteredTodos.length} dari {todos.length} tugas
                        </p>
                        <div className="h-px bg-gray-100 flex-1" />
                    </div>
                )}
            </div>
        </>
    );

    return <DashboardLayout>{content}</DashboardLayout>;
}