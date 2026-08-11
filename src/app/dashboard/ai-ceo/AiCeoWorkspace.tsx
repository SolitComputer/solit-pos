"use client";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useEffect, useRef, useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import {
    Sparkles,
    Plus,
    MessageSquare,
    Trash2,
    Edit3,
    ChevronDown,
    Check,
    Copy,
    PanelLeft,
    PanelLeftClose,
    Package,
    Wallet,
    AlertTriangle,
    Users,
    Activity,
    X,
    ArrowUp,
    Info,
    Cpu,
    Bot
} from "lucide-react";

interface ConversationSummary { id: string; title: string; updated_at: string; }
interface ChatMessage { id?: string; role: "user" | "assistant"; content: string; provider?: string; }
interface Suggestion {
    id: string; category: string; title: string; description: string;
    severity: "info" | "warning" | "critical"; status: string; created_at: string;
}

type AiProviderChoice = "auto" | "gemini" | "groq" | "deepseek";
const PROVIDER_KEY = "solit_ai_ceo_provider";

const PROVIDER_LABEL: Record<AiProviderChoice, string> = {
    auto: "Otomatis (DeepSeek → Gemini → Groq)",
    deepseek: "DeepSeek V4 Flash",
    gemini: "Gemini 2.0 Flash",
    groq: "Groq (Llama 3.3 70B)",
};

const PROVIDER_COLOR: Record<string, string> = {
    gemini: "#2563eb", // blue-600
    groq: "#ea580c",   // orange-600
};

const SEVERITY_STYLE: Record<string, { bg: string; text: string; border: string }> = {
    info: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
    warning: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
    critical: { bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-200" },
};

const TOOL_THINKING_LABEL: Record<string, string> = {
    get_dashboard_stats: "Membaca statistik dashboard...",
    get_ready_stock: "Mengecek stok laptop ready...",
    get_ready_units: "Mengecek detail unit & serial number...",
    get_minus_stock: "Mengecek stok minus...",
    get_accessory_stock: "Mengecek stok aksesori...",
    get_cashflow_summary: "Menghitung cashflow & keuangan...",
    get_recent_transactions: "Mengecek transaksi terbaru...",
    get_daftar_role: "Mengecek daftar role pengguna...",
    get_attendance_summary: "Mengecek data absensi tim...",
    get_overtime_summary: "Mengecek data lembur karyawan...",
    catat_saran_koreksi: "Mencatat masukan untuk direview...",
};
const DEFAULT_THINKING_LABEL = "Memikirkan jawaban...";

function ThinkingIndicator({ label }: { label: string }) {
    return (
        <div className="flex items-center gap-2.5 bg-gray-100/80 border border-gray-200/80 rounded-2xl px-3 py-2 sm:px-4 sm:py-2.5 w-fit shadow-xs">
            <div className="w-5 h-5 rounded-lg bg-[#1a1a2e]/10 flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-3 h-3 text-[#1a1a2e] animate-pulse" />
            </div>
            <div className="flex items-center gap-2">
                <span className="flex gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#1a1a2e]" style={{ animation: "aiCeoDot 1.1s ease-in-out infinite", animationDelay: "0ms" }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-[#1a1a2e]" style={{ animation: "aiCeoDot 1.1s ease-in-out infinite", animationDelay: "150ms" }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-[#1a1a2e]" style={{ animation: "aiCeoDot 1.1s ease-in-out infinite", animationDelay: "300ms" }} />
                </span>
                <span key={label} className="text-[11px] sm:text-xs font-medium text-gray-700">
                    {label}
                </span>
            </div>
        </div>
    );
}

function MarkdownMessage({ content }: { content: string }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(content);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="relative group/msg space-y-2">
            <div className="text-xs sm:text-[15px] leading-relaxed text-gray-800 font-normal
                [&_p]:mb-2.5 [&_p:last-child]:mb-0
                [&_strong]:font-semibold [&_strong]:text-gray-900
                [&_ul]:list-disc [&_ul]:pl-4 [&_ul]:my-2 [&_ul]:space-y-0.5
                [&_ol]:list-decimal [&_ol]:pl-4 [&_ol]:my-2 [&_ol]:space-y-0.5
                [&_li]:leading-relaxed
                [&_h1]:text-base [&_h1]:font-bold [&_h1]:text-gray-900 [&_h1]:mt-3 [&_h1]:mb-1.5
                [&_h2]:text-sm [&_h2]:font-bold [&_h2]:text-gray-900 [&_h2]:mt-2.5 [&_h2]:mb-1
                [&_h3]:text-xs [&_h3]:font-bold [&_h3]:text-gray-900 [&_h3]:mt-2 [&_h3]:mb-1
                [&_code]:bg-gray-100 [&_code]:text-[#1a1a2e] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded-md [&_code]:text-[12px] [&_code]:font-mono
                [&_blockquote]:border-l-2 [&_blockquote]:border-[#1a1a2e]/40 [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-gray-600
                [&_table]:w-full [&_table]:text-[11px] sm:[&_table]:text-xs [&_table]:border-collapse [&_table]:my-2 [&_table]:rounded-xl [&_table]:overflow-hidden [&_table]:shadow-xs
                [&_th]:bg-gray-100 [&_th]:text-gray-800 [&_th]:text-left [&_th]:border-b [&_th]:border-gray-200 [&_th]:p-2 [&_th]:font-semibold
                [&_td]:border-b [&_td]:border-gray-100 [&_td]:p-2 [&_td]:text-gray-700
                [&_tr:hover]:bg-gray-50/80
            ">
                <ReactMarkdown>{content}</ReactMarkdown>
            </div>
            <div className="flex items-center gap-2 pt-1 opacity-100 sm:opacity-0 sm:group-hover/msg:opacity-100 transition-opacity duration-200">
                <button
                    onClick={handleCopy}
                    className="flex items-center gap-1 text-[11px] sm:text-xs text-gray-400 hover:text-gray-700 transition px-2 py-0.5 rounded-md hover:bg-gray-100"
                >
                    {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                    <span>{copied ? "Tersalin" : "Salin"}</span>
                </button>
            </div>
        </div>
    );
}

function UsageBar({ counts, blocked }: { counts: Record<string, number>; blocked: Record<string, boolean> }) {
    const gemini = counts.gemini ?? 0;
    const groq = counts.groq ?? 0;
    const total = gemini + groq;

    const geminiPct = total > 0 ? Math.round((gemini / total) * 100) : 0;
    const groqPct = total > 0 ? 100 - geminiPct : 0;

    return (
        <div className="flex items-center gap-2.5 bg-gray-50 border border-gray-200 rounded-xl px-2.5 py-1 text-xs text-gray-700">
            <div className="flex flex-col gap-0.5 min-w-[110px] sm:min-w-[150px]">
                <div className="flex items-center justify-between text-[10px] sm:text-[11px] font-semibold text-gray-600">
                    <span className="flex items-center gap-1">
                        <Activity className="w-3 h-3 text-[#1a1a2e]" />
                        <span>Pemakaian Token</span>
                    </span>
                    <span className="text-[#1a1a2e] font-bold">{total} pesan</span>
                </div>
                <div className="flex h-1.5 rounded-full overflow-hidden bg-gray-200">
                    {gemini > 0 && <div style={{ width: `${geminiPct}%`, backgroundColor: PROVIDER_COLOR.gemini }} />}
                    {groq > 0 && <div style={{ width: `${groqPct}%`, backgroundColor: PROVIDER_COLOR.groq }} />}
                </div>
            </div>

            <div className="hidden sm:flex items-center gap-2 text-[10px] text-gray-500 font-medium pl-2 border-l border-gray-200">
                <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: PROVIDER_COLOR.gemini }} />
                    Gemini: <strong className="text-gray-800">{gemini}</strong> ({geminiPct}%)
                    {blocked?.gemini && <span className="text-amber-600 font-bold">· Cooldown</span>}
                </span>
                <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: PROVIDER_COLOR.groq }} />
                    Groq: <strong className="text-gray-800">{groq}</strong> ({groqPct}%)
                    {blocked?.groq && <span className="text-amber-600 font-bold">· Cooldown</span>}
                </span>
            </div>
        </div>
    );
}

export default function AiCeoWorkspace() {
    const [conversations, setConversations] = useState<ConversationSummary[]>([]);
    const [activeId, setActiveId] = useState<string | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState("");
    const [sending, setSending] = useState(false);
    const [thinkingLabel, setThinkingLabel] = useState(DEFAULT_THINKING_LABEL);
    const [loadingConv, setLoadingConv] = useState(false);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
    const [provider, setProvider] = useState<AiProviderChoice>("auto");
    const [usage, setUsage] = useState<Record<string, number>>({});
    const [providerBlocked, setProviderBlocked] = useState<Record<string, boolean>>({});
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState("");
    const [sidebarOpen, setSidebarOpen] = useState(false);

    const bottomRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        try {
            const saved = localStorage.getItem(PROVIDER_KEY) as AiProviderChoice | null;
            if (saved && ["auto", "gemini", "groq", "deepseek"].includes(saved)) setProvider(saved);
        } catch { }
    }, []);

    const handleProviderChange = (next: AiProviderChoice) => {
        setProvider(next);
        try { localStorage.setItem(PROVIDER_KEY, next); } catch { }
    };

    const loadConversations = useCallback(async () => {
        try {
            const res = await fetch("/api/ai-ceo/conversations");
            const json = await res.json();
            if (json.success) setConversations(json.data);
        } catch { }
    }, []);

    const loadConversation = useCallback(async (id: string) => {
        setLoadingConv(true);
        setShowSuggestions(false);
        try {
            const res = await fetch(`/api/ai-ceo/conversations/${id}`);
            const json = await res.json();
            if (json.success) {
                setMessages(json.messages.map((m: any) => ({ id: m.id, role: m.role, content: m.content, provider: m.provider })));
                setActiveId(id);
            }
        } catch { } finally {
            setLoadingConv(false);
        }
    }, []);

    const loadSuggestions = useCallback(async () => {
        try {
            const res = await fetch("/api/ai-ceo/suggestions?status=pending");
            const json = await res.json();
            if (json.success) setSuggestions(json.data);
        } catch { }
    }, []);

    const loadUsage = useCallback(async () => {
        try {
            const res = await fetch("/api/ai-ceo/usage");
            const json = await res.json();
            if (json.success) {
                setUsage(json.counts ?? {});
                setProviderBlocked(json.blocked ?? {});
            }
        } catch { }
    }, []);

    useEffect(() => { loadConversations(); loadSuggestions(); loadUsage(); }, [loadConversations, loadSuggestions, loadUsage]);
    useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, sending]);

    const handleNewChat = () => {
        setActiveId(null);
        setMessages([]);
        setShowSuggestions(false);
        setSidebarOpen(false);
    };

    const autoGrow = () => {
        const el = textareaRef.current;
        if (!el) return;
        el.style.height = "auto";
        el.style.height = Math.min(el.scrollHeight, 140) + "px";
    };

    const handleSend = async (customPrompt?: string) => {
        const text = (customPrompt ?? input).trim();
        if (!text || sending) return;

        if (!customPrompt) setInput("");
        if (textareaRef.current) textareaRef.current.style.height = "auto";

        setMessages((prev) => [...prev, { role: "user", content: text }]);
        setSending(true);
        setThinkingLabel(DEFAULT_THINKING_LABEL);

        try {
            const res = await fetch("/api/ai-ceo/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: text, conversationId: activeId, provider }),
            });

            if (!res.body) throw new Error("Streaming tidak didukung.");

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            let finished = false;

            while (!finished) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() ?? "";

                for (const line of lines) {
                    if (!line.trim()) continue;
                    let evt: any;
                    try { evt = JSON.parse(line); } catch { continue; }

                    if (evt.type === "tool") {
                        setThinkingLabel(TOOL_THINKING_LABEL[evt.tool] ?? DEFAULT_THINKING_LABEL);
                    } else if (evt.type === "done") {
                        setMessages((prev) => [...prev, { role: "assistant", content: evt.reply, provider: evt.provider }]);
                        if (!activeId) { setActiveId(evt.conversationId); loadConversations(); }
                        loadUsage();
                        finished = true;
                    } else if (evt.type === "error") {
                        setMessages((prev) => [...prev, { role: "assistant", content: `Gagal: ${evt.message}` }]);
                        finished = true;
                    }
                }
            }
        } catch {
            setMessages((prev) => [...prev, { role: "assistant", content: "Gagal menghubungi AI CEO, silakan coba lagi." }]);
        } finally {
            setSending(false);
        }
    };

    const handleDeleteConversation = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        await fetch(`/api/ai-ceo/conversations/${id}`, { method: "DELETE" });
        if (activeId === id) handleNewChat();
        loadConversations();
    };

    const startRename = (c: ConversationSummary, e: React.MouseEvent) => {
        e.stopPropagation();
        setRenamingId(c.id);
        setRenameValue(c.title);
    };

    const commitRename = async (id: string) => {
        const title = renameValue.trim();
        setRenamingId(null);
        if (!title) return;
        setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, title } : c)));
        try {
            await fetch(`/api/ai-ceo/conversations/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title }),
            });
        } catch { }
    };

    const handleReviewSuggestion = async (id: string, status: "reviewed" | "dismissed") => {
        await fetch(`/api/ai-ceo/suggestions/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status }),
        });
        setSuggestions((prev) => prev.filter((s) => s.id !== id));
    };

    const quickPrompts = [
        {
            icon: Package,
            title: "Stok Ready",
            desc: "Laptop & unit siap jual hari ini",
            prompt: "Stok laptop apa saja yang ready sekarang beserta jumlah dan kondisinya?"
        },
        {
            icon: Wallet,
            title: "Cashflow Toko",
            desc: "Ringkasan pemasukan & profit",
            prompt: "Beri saya ringkasan cashflow dan transaksi toko terkini."
        },
        {
            icon: AlertTriangle,
            title: "Stok Restock",
            desc: "Cek stok minus atau menipis",
            prompt: "Apakah ada stok laptop atau aksesori yang minus atau perlu di-restock?"
        },
        {
            icon: Users,
            title: "Absensi & Lembur",
            desc: "Rekap Kehadiran karyawan",
            prompt: "Bagaimana ringkasan absensi dan lembur karyawan minggu ini?"
        }
    ];

    return (
        <DashboardLayout>
            <style dangerouslySetInnerHTML={{
                __html: `
                @keyframes aiCeoDot { 0%, 60%, 100% { transform: translateY(0); opacity: 0.3; } 30% { transform: translateY(-4px); opacity: 1; } }
            `}} />

            {/* Layout container optimized for both Mobile and Desktop */}
            <div className="flex h-[calc(100vh-6rem)] sm:h-[calc(100vh-3.5rem)] -mx-4 -my-4 lg:mx-0 lg:my-0 w-[calc(100%+2rem)] lg:w-full bg-white text-gray-800 overflow-hidden font-sans rounded-none sm:rounded-2xl border-0 sm:border border-gray-200 shadow-xs">

                {/* Sidebar Overlay on Mobile */}
                {sidebarOpen && (
                    <div
                        onClick={() => setSidebarOpen(false)}
                        className="fixed inset-0 z-40 bg-black/30 lg:hidden backdrop-blur-xs transition-opacity"
                    />
                )}

                {/* Left Navigation Sidebar */}
                <aside
                    className={`fixed inset-y-0 left-0 z-50 w-72 lg:static lg:z-auto lg:w-64 flex-shrink-0 bg-gray-50 border-r border-gray-200 flex flex-col transition-all duration-300 ease-in-out ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:-ml-64"
                        }`}
                >
                    {/* Sidebar Header */}
                    <div className="p-3 flex items-center justify-between border-b border-gray-200">
                        <button
                            onClick={handleNewChat}
                            className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-[#1a1a2e] text-white px-3 py-2 text-xs font-semibold hover:bg-[#2d2d4a] shadow-xs transition"
                        >
                            <Plus className="w-4 h-4" />
                            <span>Percakapan Baru</span>
                        </button>
                        <button
                            onClick={() => setSidebarOpen(false)}
                            className="lg:hidden ml-2 p-1.5 rounded-lg text-gray-400 hover:text-gray-600"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Conversation List */}
                    <div className="flex-1 overflow-y-auto px-2 py-3 space-y-1 scrollbar-thin">
                        <div className="px-2 pb-1 text-[11px] font-bold tracking-wider text-gray-400 uppercase">
                            Riwayat Chat
                        </div>
                        {conversations.map((c) => {
                            const isActive = activeId === c.id && !showSuggestions;
                            return (
                                <div
                                    key={c.id}
                                    onClick={() => { loadConversation(c.id); setSidebarOpen(false); }}
                                    className={`group relative flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium cursor-pointer transition ${isActive
                                            ? "bg-white text-[#1a1a2e] shadow-xs border border-gray-200 font-semibold"
                                            : "text-gray-600 hover:bg-gray-200/60"
                                        }`}
                                >
                                    <MessageSquare className={`w-3.5 h-3.5 flex-shrink-0 ${isActive ? "text-[#1a1a2e]" : "text-gray-400"}`} />

                                    {renamingId === c.id ? (
                                        <input
                                            autoFocus
                                            value={renameValue}
                                            onChange={(e) => setRenameValue(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter") commitRename(c.id);
                                                if (e.key === "Escape") setRenamingId(null);
                                            }}
                                            onBlur={() => commitRename(c.id)}
                                            className="flex-1 min-w-0 bg-white border border-[#1a1a2e] rounded px-1.5 py-0.5 text-xs focus:outline-none"
                                        />
                                    ) : (
                                        <span className="flex-1 truncate">{c.title}</span>
                                    )}

                                    {renamingId !== c.id && (
                                        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity">
                                            <button
                                                onClick={(e) => startRename(c, e)}
                                                className="p-1 text-gray-400 hover:text-gray-700 rounded"
                                                title="Ganti nama"
                                            >
                                                <Edit3 className="w-3 h-3" />
                                            </button>
                                            <button
                                                onClick={(e) => handleDeleteConversation(c.id, e)}
                                                className="p-1 text-gray-400 hover:text-rose-600 rounded"
                                                title="Hapus"
                                            >
                                                <Trash2 className="w-3 h-3" />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                        {conversations.length === 0 && (
                            <p className="text-xs text-gray-400 px-3 py-4 italic">Belum ada riwayat percakapan.</p>
                        )}
                    </div>

                    {/* Sidebar Footer */}
                    <div className="p-3 border-t border-gray-200">
                        <button
                            onClick={() => { setShowSuggestions((v) => !v); setSidebarOpen(false); }}
                            className={`w-full flex items-center justify-between rounded-xl px-3 py-2 text-xs font-semibold transition ${showSuggestions
                                    ? "bg-[#1a1a2e] text-white shadow-xs"
                                    : "bg-white text-gray-700 hover:bg-gray-100 border border-gray-200"
                                }`}
                        >
                            <span className="flex items-center gap-2">
                                <Info className="w-3.5 h-3.5" />
                                <span>Review & Koreksi AI</span>
                            </span>
                            {suggestions.length > 0 && (
                                <span className="bg-rose-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.2">
                                    {suggestions.length}
                                </span>
                            )}
                        </button>
                    </div>
                </aside>

                {/* Main Workspace Workspace */}
                <main className="flex-1 flex flex-col min-w-0 bg-white h-full">
                    {/* Top Workspace Header with Directly Visible Usage Bar */}
                    <header className="h-12 sm:h-14 px-3 sm:px-6 border-b border-gray-200 bg-white flex items-center justify-between gap-2 z-10 flex-shrink-0">
                        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                            <button
                                onClick={() => setSidebarOpen((v) => !v)}
                                className="p-1.5 rounded-xl text-gray-600 hover:bg-gray-100 transition"
                                title="Buka/Tutup Sidebar"
                            >
                                {sidebarOpen ? <PanelLeftClose className="w-4 h-4 sm:w-5 sm:h-5 text-gray-500" /> : <PanelLeft className="w-4 h-4 sm:w-5 sm:h-5 text-gray-500" />}
                            </button>

                            <div className="flex items-center gap-2 min-w-0">
                                <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-[#1a1a2e] flex items-center justify-center text-white shadow-xs flex-shrink-0">
                                    <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                </div>
                                <h1 className="text-xs sm:text-sm font-bold text-[#1a1a2e] truncate">AI CEO</h1>
                            </div>
                        </div>

                        {/* Directly Visible Pemakaian Token / Message Usage Bar */}
                        <div className="flex items-center gap-2">
                            <UsageBar counts={usage} blocked={providerBlocked} />
                        </div>
                    </header>

                    {/* Chat Content Body */}
                    <div className="flex-1 flex flex-col min-h-0 relative overflow-hidden">
                        {showSuggestions ? (
                            /* Review Suggestions Panel */
                            <div className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-3 sm:space-y-4 max-w-5xl mx-auto w-full">
                                <div className="flex items-center justify-between pb-2 border-b border-gray-200">
                                    <h2 className="text-xs sm:text-base font-bold text-gray-900 flex items-center gap-2">
                                        <Info className="w-4 h-4 sm:w-5 sm:h-5 text-[#1a1a2e]" />
                                        <span>Catatan & Koreksi Pengetahuan AI</span>
                                    </h2>
                                    <span className="text-[11px] sm:text-xs text-gray-500">{suggestions.length} pending</span>
                                </div>

                                {suggestions.length === 0 && (
                                    <div className="text-center py-12 text-gray-400 text-xs sm:text-sm">
                                        Tidak ada catatan atau koreksi AI yang perlu ditinjau saat ini.
                                    </div>
                                )}

                                {suggestions.map((s) => {
                                    const style = SEVERITY_STYLE[s.severity] ?? SEVERITY_STYLE.info;
                                    return (
                                        <div key={s.id} className={`rounded-2xl border ${style.border} ${style.bg} p-3 sm:p-4 space-y-2 shadow-xs`}>
                                            <div className="flex items-center justify-between">
                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${style.text} bg-white uppercase`}>
                                                    {s.severity}
                                                </span>
                                                <span className="text-[10px] text-gray-400 uppercase font-medium">{s.category}</span>
                                            </div>
                                            <h3 className="text-xs sm:text-sm font-bold text-gray-800">{s.title}</h3>
                                            <p className="text-xs text-gray-600 leading-relaxed">{s.description}</p>
                                            <div className="flex items-center gap-2 pt-1">
                                                <button
                                                    onClick={() => handleReviewSuggestion(s.id, "reviewed")}
                                                    className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-[11px] font-semibold hover:bg-emerald-700 transition"
                                                >
                                                    Tandai Sudah Ditinjau
                                                </button>
                                                <button
                                                    onClick={() => handleReviewSuggestion(s.id, "dismissed")}
                                                    className="px-2.5 py-1 rounded-lg bg-gray-200 text-gray-700 text-[11px] font-semibold hover:bg-gray-300 transition"
                                                >
                                                    Abaikan
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            /* Chat Messages Stream */
                            <div className="flex-1 overflow-y-auto scrollbar-thin px-3 sm:px-6 py-3 sm:py-5 space-y-4 max-w-5xl mx-auto w-full">
                                {messages.length === 0 && !loadingConv && (
                                    /* Compact Mobile Welcome Screen */
                                    <div className="flex flex-col items-center justify-center min-h-[80%] text-center px-2 py-2 sm:py-6">
                                        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-[#1a1a2e] flex items-center justify-center text-white shadow-md mb-2 sm:mb-3">
                                            <Sparkles className="w-5 h-5 sm:w-6 sm:h-6" />
                                        </div>
                                        <h2 className="text-lg sm:text-2xl md:text-3xl font-bold text-gray-900 tracking-tight">
                                            Bagaimana AI CEO bisa membantu Anda?
                                        </h2>
                                        <p className="text-xs sm:text-sm text-gray-500 mt-1 max-w-lg leading-relaxed line-clamp-2 sm:line-clamp-none">
                                            Asisten bisnis real-time untuk memantau stok unit POS, analisa penjualan, absensi tim, & cashflow toko Anda.
                                        </p>

                                        {/* Starter Suggestions Cards */}
                                        <div className="grid grid-cols-2 gap-2 sm:gap-3 mt-4 sm:mt-6 w-full max-w-3xl text-left">
                                            {quickPrompts.map((item, idx) => {
                                                const Icon = item.icon;
                                                return (
                                                    <button
                                                        key={idx}
                                                        onClick={() => handleSend(item.prompt)}
                                                        className="group flex flex-col p-2.5 sm:p-3.5 rounded-2xl bg-white border border-gray-200 hover:border-[#1a1a2e] shadow-xs hover:shadow-md transition-all duration-200 text-left"
                                                    >
                                                        <div className="flex items-center gap-1.5 sm:gap-2.5 mb-1">
                                                            <div className="p-1 rounded-lg bg-gray-100 text-[#1a1a2e] flex-shrink-0">
                                                                <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                                            </div>
                                                            <span className="text-[11px] sm:text-xs font-bold text-gray-900 truncate">{item.title}</span>
                                                        </div>
                                                        <p className="text-[10px] sm:text-xs text-gray-500 line-clamp-2 leading-tight sm:leading-relaxed">
                                                            {item.desc}
                                                        </p>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* Message Items */}
                                {messages.map((m, i) => {
                                    const isUser = m.role === "user";
                                    return (
                                        <div
                                            key={m.id ?? i}
                                            className={`flex gap-2 sm:gap-4 ${isUser ? "justify-end" : "justify-start"}`}
                                        >
                                            {!isUser && (
                                                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-[#1a1a2e] flex items-center justify-center text-white shadow-xs flex-shrink-0 mt-0.5">
                                                    <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                                </div>
                                            )}

                                            <div className={`flex flex-col max-w-[92%] sm:max-w-[85%] ${isUser ? "items-end" : "items-start"}`}>
                                                <div
                                                    className={`px-3.5 py-2 sm:px-4 sm:py-2.5 rounded-2xl text-xs sm:text-sm leading-relaxed ${isUser
                                                            ? "bg-[#1a1a2e] text-white rounded-tr-xs shadow-xs font-normal"
                                                            : "bg-transparent text-gray-800"
                                                        }`}
                                                >
                                                    {isUser ? (
                                                        <span className="whitespace-pre-wrap">{m.content}</span>
                                                    ) : (
                                                        <MarkdownMessage content={m.content} />
                                                    )}
                                                </div>

                                                {!isUser && m.provider && (
                                                    <div className="flex items-center gap-1 text-[9px] sm:text-[10px] text-gray-400 mt-0.5 px-1">
                                                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: PROVIDER_COLOR[m.provider] ?? "#9CA3AF" }} />
                                                        <span>via {PROVIDER_LABEL[m.provider as AiProviderChoice] ?? m.provider}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}

                                {sending && (
                                    <div className="flex gap-2 sm:gap-4 items-start">
                                        <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-[#1a1a2e] flex items-center justify-center text-white shadow-xs flex-shrink-0">
                                            <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin" />
                                        </div>
                                        <ThinkingIndicator label={thinkingLabel} />
                                    </div>
                                )}

                                <div ref={bottomRef} />
                            </div>
                        )}

                        {/* Bottom Prompt Input Card */}
                        {!showSuggestions && (
                            <div className="px-3 sm:px-6 py-2 bg-white border-t border-gray-100 flex-shrink-0">
                                <div className="max-w-5xl mx-auto">
                                    <div className="relative rounded-2xl bg-white border border-gray-200 focus-within:border-[#1a1a2e] shadow-xs focus-within:shadow-md transition-all duration-200 p-2 sm:p-2.5">
                                        <textarea
                                            ref={textareaRef}
                                            value={input}
                                            onChange={(e) => { setInput(e.target.value); autoGrow(); }}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter" && !e.shiftKey) {
                                                    e.preventDefault();
                                                    handleSend();
                                                }
                                            }}
                                            rows={1}
                                            placeholder="Tanya AI CEO..."
                                            className="w-full resize-none bg-transparent border-0 text-xs sm:text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-0 max-h-28 sm:max-h-36 px-1 py-0.5"
                                        />

                                        {/* Bottom Action Toolbar inside Input Box */}
                                        <div className="flex items-center justify-between pt-1.5 mt-0.5 border-t border-gray-100">
                                            {/* Provider Selector Right Next to Chat Input */}
                                            <div className="relative flex items-center">
                                                <select
                                                    value={provider}
                                                    onChange={(e) => handleProviderChange(e.target.value as AiProviderChoice)}
                                                    className="appearance-none text-[10px] sm:text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 border border-gray-200 rounded-lg pl-2 pr-6 py-0.5 sm:py-1 focus:outline-none cursor-pointer transition shadow-xs max-w-[130px] sm:max-w-none truncate"
                                                    title="Pilih Model AI"
                                                >
                                                    <option value="auto">Otomatis (DeepSeek → Gemini → Groq)</option>
                                                    <option value="deepseek">DeepSeek V4 Flash</option>
                                                    <option value="gemini">Gemini 2.0 Flash</option>
                                                    <option value="groq">Groq (Llama 3.3 70B)</option>
                                                </select>
                                                <ChevronDown className="w-3 h-3 text-gray-400 absolute right-1.5 pointer-events-none" />
                                            </div>

                                            <button
                                                onClick={() => handleSend()}
                                                disabled={sending || !input.trim()}
                                                className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-[#1a1a2e] hover:bg-[#2d2d4a] disabled:bg-gray-200 text-white disabled:text-gray-400 flex items-center justify-center transition-all duration-150 shadow-xs flex-shrink-0"
                                                title="Kirim pesan"
                                            >
                                                <ArrowUp className="w-4 h-4 sm:w-5 sm:h-5" />
                                            </button>
                                        </div>
                                    </div>
                                    <p className="hidden sm:block text-[10px] text-center text-gray-400 mt-1">
                                        AI CEO terhubung langsung ke database POS Solit real-time.
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </main>
            </div>
        </DashboardLayout>
    );
}