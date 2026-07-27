"use client";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useEffect, useRef, useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";

interface ConversationSummary { id: string; title: string; updated_at: string; }
interface ChatMessage { id?: string; role: "user" | "assistant"; content: string; provider?: string; }
interface Suggestion {
    id: string; category: string; title: string; description: string;
    severity: "info" | "warning" | "critical"; status: string; created_at: string;
}

type AiProviderChoice = "auto" | "gemini" | "groq";
const PROVIDER_KEY = "solit_ai_ceo_provider";
const PROVIDER_LABEL: Record<AiProviderChoice, string> = {
    auto: "Otomatis",
    gemini: "Gemini",
    groq: "Groq (Llama)",
};
const PROVIDER_COLOR: Record<string, string> = {
    gemini: "#4285f4",
    groq: "#f97316",
};

const SEVERITY_STYLE: Record<string, string> = {
    info: "bg-blue-50 text-blue-700",
    warning: "bg-amber-50 text-amber-700",
    critical: "bg-red-50 text-red-700",
};

const TOOL_THINKING_LABEL: Record<string, string> = {
    get_dashboard_stats: "Membaca statistik dashboard...",
    get_ready_stock: "Mengecek stok laptop ready...",
    get_ready_units: "Mengecek detail unit & serial number...",
    get_minus_stock: "Mengecek stok minus...",
    get_accessory_stock: "Mengecek stok aksesori...",
    get_cashflow_summary: "Menghitung cashflow...",
    get_recent_transactions: "Mengecek transaksi terbaru...",
    get_daftar_role: "Mengecek daftar role...",
    get_attendance_summary: "Mengecek data absensi...",
    get_overtime_summary: "Mengecek data lembur...",
    catat_saran_koreksi: "Mencatat catatan untuk direview...",
};
const DEFAULT_THINKING_LABEL = "Memikirkan jawaban...";

function ThinkingIndicator({ label }: { label: string }) {
    return (
        <div className="flex items-center gap-2.5 bg-gray-50 border border-gray-100 rounded-2xl px-4 py-2.5 w-fit" style={{ animation: "aiCeoFadeIn 0.2s ease-out both" }}>
            <span className="flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-gray-400" style={{ animation: "aiCeoDot 1.1s ease-in-out infinite", animationDelay: "0ms" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-gray-400" style={{ animation: "aiCeoDot 1.1s ease-in-out infinite", animationDelay: "150ms" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-gray-400" style={{ animation: "aiCeoDot 1.1s ease-in-out infinite", animationDelay: "300ms" }} />
            </span>
            <span key={label} className="text-xs text-gray-400" style={{ animation: "aiCeoFadeIn 0.3s ease-out both" }}>
                {label}
            </span>
        </div>
    );
}

function splitIntro(content: string): { intro: string; rest: string } {
    const trimmed = content.trim();
    const idx = trimmed.indexOf("\n\n");
    if (idx === -1) return { intro: trimmed, rest: "" };
    return { intro: trimmed.slice(0, idx).trim(), rest: trimmed.slice(idx + 2).trim() };
}

function MarkdownMessage({ content }: { content: string }) {
    const { intro, rest } = splitIntro(content);
    return (
        <div className="space-y-2.5">
            {intro && (
                <div className="text-[15px] leading-relaxed text-gray-800 [&_p]:m-0 [&_strong]:font-semibold">
                    <ReactMarkdown>{intro}</ReactMarkdown>
                </div>
            )}
            {rest && (
                <div className="text-sm leading-relaxed space-y-2
                    [&_p]:m-0
                    [&_strong]:font-semibold
                    [&_ul]:list-disc [&_ul]:pl-4 [&_ul]:space-y-0.5
                    [&_ol]:list-decimal [&_ol]:pl-4 [&_ol]:space-y-0.5
                    [&_li]:mt-0.5
                    [&_h1]:text-sm [&_h1]:font-bold [&_h1]:mt-2
                    [&_h2]:text-sm [&_h2]:font-bold [&_h2]:mt-2
                    [&_h3]:text-sm [&_h3]:font-bold [&_h3]:mt-2
                    [&_code]:bg-black/5 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-[13px]
                    [&_table]:w-full [&_table]:text-xs [&_table]:border-collapse [&_table]:my-2
                    [&_th]:text-left [&_th]:border-b [&_th]:border-gray-200 [&_th]:py-1 [&_th]:pr-3 [&_th]:font-semibold
                    [&_td]:border-b [&_td]:border-gray-100 [&_td]:py-1 [&_td]:pr-3
                ">
                    <ReactMarkdown>{rest}</ReactMarkdown>
                </div>
            )}
        </div>
    );
}

function UsageBar({ counts, blocked }: { counts: Record<string, number>; blocked: Record<string, boolean> }) {
    const gemini = counts.gemini ?? 0;
    const groq = counts.groq ?? 0;
    const total = gemini + groq;

    if (total === 0) {
        return <p className="text-[11px] text-gray-300 whitespace-nowrap">Belum ada pemakaian hari ini</p>;
    }

    const geminiPct = Math.round((gemini / total) * 100);
    const groqPct = 100 - geminiPct;

    return (
        <div className="flex flex-col gap-1 w-full sm:w-60">
            <div className="flex items-center justify-between text-[10px] text-gray-400">
                <span>Pemakaian hari ini</span>
                <span>{total} pesan</span>
            </div>
            <div className="flex h-1.5 rounded-full overflow-hidden bg-gray-100">
                {gemini > 0 && <div style={{ width: `${geminiPct}%`, backgroundColor: PROVIDER_COLOR.gemini }} />}
                {groq > 0 && <div style={{ width: `${groqPct}%`, backgroundColor: PROVIDER_COLOR.groq }} />}
            </div>
            <div className="flex items-center gap-3 text-[10px] text-gray-400 flex-wrap">
                <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: PROVIDER_COLOR.gemini }} />
                    Gemini {gemini} ({geminiPct}%){blocked?.gemini && <span className="text-amber-500 font-medium"> · cooldown</span>}
                </span>
                <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: PROVIDER_COLOR.groq }} />
                    Groq {groq} ({groqPct}%){blocked?.groq && <span className="text-amber-500 font-medium"> · cooldown</span>}
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
    const bottomRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const cardRef = useRef<HTMLDivElement>(null);
    const [cardHeight, setCardHeight] = useState<number | null>(null);

    useEffect(() => {
        function updateHeight() {
            if (!cardRef.current) return;
            const top = cardRef.current.getBoundingClientRect().top;
            const available = window.innerHeight - top - 16;
            setCardHeight(Math.max(available, 420));
        }
        updateHeight();
        window.addEventListener("resize", updateHeight);
        return () => window.removeEventListener("resize", updateHeight);
    }, []);

    useEffect(() => {
        try {
            const saved = localStorage.getItem(PROVIDER_KEY) as AiProviderChoice | null;
            if (saved && ["auto", "gemini", "groq"].includes(saved)) setProvider(saved);
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

    const handleNewChat = () => { setActiveId(null); setMessages([]); };

    const autoGrow = () => {
        const el = textareaRef.current;
        if (!el) return;
        el.style.height = "auto";
        el.style.height = Math.min(el.scrollHeight, 140) + "px";
    };

    const handleSend = async () => {
        const text = input.trim();
        if (!text || sending) return;
        setInput("");
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
                        setMessages((prev) => [...prev, { role: "assistant", content: `⚠️ ${evt.message}` }]);
                        finished = true;
                    }
                }
            }
        } catch {
            setMessages((prev) => [...prev, { role: "assistant", content: "⚠️ Gagal menghubungi AI CEO, coba lagi." }]);
        } finally {
            setSending(false);
        }
    };

    const handleDeleteConversation = async (id: string) => {
        await fetch(`/api/ai-ceo/conversations/${id}`, { method: "DELETE" });
        if (activeId === id) handleNewChat();
        loadConversations();
    };

    const startRename = (c: ConversationSummary) => {
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

    return (
        <DashboardLayout>
            <style dangerouslySetInnerHTML={{
                __html: `
                @keyframes aiCeoDot { 0%, 60%, 100% { transform: translateY(0); opacity: 0.35; } 30% { transform: translateY(-4px); opacity: 1; } }
                @keyframes aiCeoFadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
            `}} />

            <div className="w-full max-w-[1400px] mx-auto p-3 md:p-5">
                <div
                    ref={cardRef}
                    style={{ height: cardHeight ? `${cardHeight}px` : undefined }}
                    className="flex flex-col lg:flex-row min-h-[420px] rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden"
                >
                    <aside className="w-full lg:w-64 flex-shrink-0 border-b lg:border-b-0 lg:border-r border-gray-100 bg-gray-50/60 flex flex-col max-h-40 lg:max-h-none">
                        <div className="p-3 border-b border-gray-100">
                            <button onClick={handleNewChat} className="w-full rounded-xl bg-[#1a1a2e] text-white text-sm font-semibold py-2.5 hover:bg-[#2d2d4a] transition">
                                + Percakapan Baru
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-2 space-y-1 min-h-0">
                            {conversations.map((c) => (
                                <div key={c.id} className={`group flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm ${activeId === c.id ? "bg-white shadow-sm font-semibold text-[#1a1a2e]" : "text-gray-600 hover:bg-white/70"}`}>
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
                                            className="flex-1 min-w-0 text-sm bg-white border border-gray-200 rounded-md px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-[#1a1a2e]/30"
                                        />
                                    ) : (
                                        <span onClick={() => loadConversation(c.id)} className="flex-1 truncate cursor-pointer">{c.title}</span>
                                    )}
                                    {renamingId !== c.id && (
                                        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1.5 flex-shrink-0">
                                            <button onClick={() => startRename(c)} className="text-gray-300 hover:text-[#1a1a2e] text-xs" title="Ganti nama">✎</button>
                                            <button onClick={() => handleDeleteConversation(c.id)} className="text-gray-300 hover:text-red-500 text-xs" title="Hapus">✕</button>
                                        </div>
                                    )}
                                </div>
                            ))}
                            {conversations.length === 0 && <p className="text-xs text-gray-400 px-3 py-2">Belum ada percakapan.</p>}
                        </div>
                        <div className="p-3 border-t border-gray-100">
                            <button onClick={() => setShowSuggestions((v) => !v)} className="w-full text-left text-xs font-semibold text-gray-500 hover:text-[#1a1a2e] flex items-center justify-between">
                                <span>Catatan/Koreksi AI</span>
                                {suggestions.length > 0 && <span className="bg-red-500 text-white rounded-full px-1.5 py-0.5 text-[10px]">{suggestions.length}</span>}
                            </button>
                        </div>
                    </aside>

                    <div className="flex-1 flex flex-col min-w-0 min-h-0">
                        <div className="border-b border-gray-100 bg-white px-4 md:px-6 py-3 flex items-start justify-between gap-4 flex-wrap">
                            <div>
                                <h1 className="text-sm font-bold text-[#1a1a2e]">AI CEO</h1>
                                <p className="text-xs text-gray-400">Tanya stok, penjualan, cashflow, atau minta AI mencatat koreksi untuk direview.</p>
                            </div>
                            <div className="flex items-center gap-3 flex-wrap">
                                <UsageBar counts={usage} blocked={providerBlocked} />
                                <select
                                    value={provider}
                                    onChange={(e) => handleProviderChange(e.target.value as AiProviderChoice)}
                                    className="text-xs font-medium text-gray-600 border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/20 flex-shrink-0"
                                    title="Pilih provider AI"
                                >
                                    <option value="auto">Otomatis (Gemini → Groq)</option>
                                    <option value="gemini">Gemini saja</option>
                                    <option value="groq">Groq saja</option>
                                </select>
                            </div>
                        </div>

                        {showSuggestions ? (
                            <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-3 min-h-0">
                                {suggestions.length === 0 && <p className="text-sm text-gray-400">Tidak ada catatan/koreksi pending saat ini.</p>}
                                {suggestions.map((s) => (
                                    <div key={s.id} className="rounded-xl border border-gray-100 bg-white p-4 space-y-2">
                                        <div className="flex items-center gap-2">
                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${SEVERITY_STYLE[s.severity] ?? SEVERITY_STYLE.info}`}>{s.severity.toUpperCase()}</span>
                                            <span className="text-[10px] text-gray-400 uppercase">{s.category}</span>
                                        </div>
                                        <p className="text-sm font-semibold text-gray-800">{s.title}</p>
                                        <p className="text-sm text-gray-500">{s.description}</p>
                                        <div className="flex gap-2 pt-1">
                                            <button onClick={() => handleReviewSuggestion(s.id, "reviewed")} className="text-xs font-semibold text-emerald-600 hover:underline">Tandai sudah ditinjau</button>
                                            <button onClick={() => handleReviewSuggestion(s.id, "dismissed")} className="text-xs font-semibold text-gray-400 hover:underline">Abaikan</button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <>
                                <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 min-h-0">
                                    {messages.length === 0 && !loadingConv && (
                                        <div className="text-sm text-gray-400 text-center mt-10">
                                            Coba tanya: <span className="italic">&quot;Stok laptop apa yang ready sekarang?&quot;</span>
                                        </div>
                                    )}
                                    {messages.map((m, i) => (
                                        <div
                                            key={m.id ?? i}
                                            className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}
                                            style={{ animation: "aiCeoFadeIn 0.25s ease-out both" }}
                                        >
                                            <div className={`max-w-[85%] md:max-w-[75%] rounded-2xl px-4 py-2.5 ${m.role === "user" ? "bg-[#1a1a2e] text-white text-sm" : "bg-gray-50 border border-gray-100 text-gray-700"}`}>
                                                {m.role === "assistant" ? <MarkdownMessage content={m.content} /> : m.content}
                                            </div>
                                            {m.role === "assistant" && m.provider && (
                                                <span className="text-[10px] text-gray-300 mt-1 px-1 flex items-center gap-1">
                                                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: PROVIDER_COLOR[m.provider] ?? "#9ca3af" }} />
                                                    dijawab via {PROVIDER_LABEL[m.provider as AiProviderChoice] ?? m.provider}
                                                </span>
                                            )}
                                        </div>
                                    ))}
                                    {sending && <ThinkingIndicator label={thinkingLabel} />}
                                    <div ref={bottomRef} />
                                </div>

                                <div className="border-t border-gray-100 bg-white p-3 md:p-4">
                                    <div className="flex items-end gap-2">
                                        <textarea
                                            ref={textareaRef}
                                            value={input}
                                            onChange={(e) => { setInput(e.target.value); autoGrow(); }}
                                            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                                            rows={1}
                                            placeholder="Tanya sesuatu ke AI CEO..."
                                            className="flex-1 resize-none rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/30 max-h-[140px]"
                                        />
                                        <button
                                            onClick={handleSend}
                                            disabled={sending || !input.trim()}
                                            className="rounded-xl bg-[#1a1a2e] text-white text-sm font-semibold px-4 py-2.5 disabled:opacity-40 hover:bg-[#2d2d4a] transition flex-shrink-0"
                                        >
                                            Kirim
                                        </button>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
}