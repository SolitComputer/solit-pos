"use client";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/services/supabase";
import { ThinkingIndicator, MarkdownMessage, CHAT_DOT_KEYFRAMES } from "@/components/ai/ChatPrimitives";
import { Sparkles, ArrowUp, ArrowLeft, CheckCircle2, AlertTriangle, Bell, Plus } from "lucide-react";

interface ReminderSummary {
    id: string;
    title: string;
    message: string;
    severity: "info" | "warning" | "critical";
    status: "terkirim" | "dibaca" | "dibalas" | "selesai" | "diabaikan";
    created_at: string;
}
interface ConversationSummary {
    id: string;
    title: string;
    updated_at: string;
}
interface ChatMessage { id?: string; role: "user" | "assistant"; content: string; }

const SEVERITY_STYLE: Record<string, { bg: string; text: string; border: string; icon: any }> = {
    info: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200", icon: Bell },
    warning: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", icon: AlertTriangle },
    critical: { bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-200", icon: AlertTriangle },
};

const STATUS_LABEL: Record<string, string> = {
    terkirim: "Belum dibaca",
    dibaca: "Sudah dibaca",
    dibalas: "Menunggu admin",
    selesai: "Selesai",
    diabaikan: "Diabaikan",
};

// Keyframes tambahan khusus halaman ini: fade-in pesan baru & efek "ping" lembut di titik unread.
// Warna tidak diubah sama sekali — ini murni animasi, tidak nambah palet baru.
const EXTRA_KEYFRAMES = `
@keyframes messageIn {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes softPing {
  0% { transform: scale(1); opacity: 0.7; }
  75%, 100% { transform: scale(2.4); opacity: 0; }
}
`;

export default function TanyaCeoWorkspace() {
    const [activeTab, setActiveTab] = useState<"chat" | "pengingat">("chat");
    const [reminders, setReminders] = useState<ReminderSummary[]>([]);
    const [conversations, setConversations] = useState<ConversationSummary[]>([]);
    const [loadingList, setLoadingList] = useState(true);
    const [activeId, setActiveId] = useState<string | null>(null); // Boleh null untuk "Chat Baru"
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState("");
    const [sending, setSending] = useState(false);
    const [thinkingLabel, setThinkingLabel] = useState("Memikirkan jawaban...");
    const [loadingThread, setLoadingThread] = useState(false);
    const bottomRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const autoSelectFirstRef = useRef(false);
    const [activeConversationId, setActiveConversationId] = useState<string | null>(null);

    const openThread = useCallback(async (id: string | null, type: "reminder" | "conversation") => {
        setActiveId(id);
        if (!id) {
            setMessages([]);
            setActiveConversationId(null);
            return;
        }
        setLoadingThread(true);
        try {
            const endpoint = type === "reminder" ? "reminders" : "conversations";
            const res = await fetch(`/api/ai-assistant/${endpoint}/${id}`, { cache: "no-store" });
            const json = await res.json();
            if (json.success) {
                setMessages(json.messages.map((m: any) => ({ id: m.id, role: m.role, content: m.content })));
                setActiveConversationId(json.conversation?.id ?? json.conversationId ?? (type === "conversation" ? id : null));
                if (type === "reminder") {
                    setReminders((prev) => prev.map((r) => (r.id === id && r.status === "terkirim" ? { ...r, status: "dibaca" } : r)));
                }
            }
        } catch { } finally {
            setLoadingThread(false);
        }
    }, []);

    useEffect(() => {
        if (!activeConversationId) return;

        const channelId = `tanya_ceo_messages_${activeConversationId}_${Math.random().toString(36).substring(2, 9)}`;
        const chan = supabase
            .channel(channelId)
            .on(
                "postgres_changes",
                {
                    event: "INSERT",
                    schema: "public",
                    table: "ai_ceo_messages",
                    filter: `conversation_id=eq.${activeConversationId}`,
                },
                (payload) => {
                    const row = payload.new as any;
                    // Supaya tidak double-insert (kalau ini dikirim user sendiri, biasanya sudah dioptimistic update)
                    setMessages((prev) => {
                        if (prev.some((m) => m.id === row.id)) return prev; // Already exists
                        if (row.role === "assistant" && row.provider === "system") {
                            // Pesan admin (via tool jawab_pertanyaan_member)
                            return [...prev, { id: row.id, role: "assistant", content: row.content }];
                        }
                        // Ignore other messages as they are handled by streaming or already optimistic
                        return prev;
                    });
                    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(chan);
        };
    }, [activeConversationId]);

    const loadData = useCallback(async () => {
        try {
            setLoadingList(true);
            const [remRes, convRes] = await Promise.all([
                fetch("/api/ai-assistant/reminders", { cache: "no-store" }),
                fetch("/api/ai-assistant/conversations", { cache: "no-store" })
            ]);

            const remJson = await remRes.json();
            const convJson = await convRes.json();

            const remList = remJson.success ? (remJson.data ?? []) : [];
            const convList = convJson.success ? (convJson.data ?? []) : [];

            setReminders(remList);
            setConversations(convList);

            // Auto select untuk reminder yang belum dibaca jika tab pengingat (bisa juga otomatis switch kalau ada reminder)
            if (!autoSelectFirstRef.current && remList.some((r: any) => r.status === "terkirim") && typeof window !== "undefined" && window.innerWidth >= 640) {
                autoSelectFirstRef.current = true;
                setActiveTab("pengingat");
                const firstUnread = remList.find((r: any) => r.status === "terkirim");
                if (firstUnread) openThread(firstUnread.id, "reminder");
            }
        } catch { } finally {
            setLoadingList(false);
        }
    }, [openThread]);

    useEffect(() => { loadData(); }, [loadData]);
    useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, sending]);


    const handleSend = async () => {
        const text = input.trim();
        if (!text || sending || (activeTab === "pengingat" && !activeId)) return;

        setInput("");
        if (textareaRef.current) textareaRef.current.style.height = "auto";
        setMessages((prev) => [...prev, { role: "user", content: text }]);
        setSending(true);
        setThinkingLabel("Memikirkan jawaban...");

        try {
            const bodyPayload = activeTab === "pengingat"
                ? { message: text, reminderId: activeId }
                : { message: text, conversationId: activeId };

            const res = await fetch("/api/ai-assistant/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(bodyPayload),
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
                        setThinkingLabel(evt.tool === "tandai_pengingat_selesai" ? "Menandai selesai..." : evt.tool === "eskalasi_ke_admin" ? "Mengirim ke admin..." : "Memproses...");
                    } else if (evt.type === "done") {
                        if (evt.reply) {
                            setMessages((prev) => [...prev, { role: "assistant", content: evt.reply }]);
                        }
                        if (activeTab === "chat" && !activeId && evt.conversationId) {
                            setActiveId(evt.conversationId);
                            setActiveConversationId(evt.conversationId);
                        }
                        loadData();
                        finished = true;
                    } else if (evt.type === "error") {
                        setMessages((prev) => [...prev, { role: "assistant", content: `Gagal: ${evt.message}` }]);
                        finished = true;
                    }
                }
            }
        } catch {
            setMessages((prev) => [...prev, { role: "assistant", content: "Gagal menghubungi asisten, coba lagi." }]);
        } finally {
            setSending(false);
        }
    };

    const markSelesaiManual = async () => {
        if (!activeId || activeTab !== "pengingat") return;
        await fetch(`/api/ai-assistant/reminders/${activeId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "selesai" }),
        });
        setReminders((prev) => prev.map((r) => (r.id === activeId ? { ...r, status: "selesai" } : r)));
    };

    const activeReminder = activeTab === "pengingat" ? (reminders.find((r) => r.id === activeId) ?? null) : null;
    const activeConversation = activeTab === "chat" ? (conversations.find((c) => c.id === activeId) ?? null) : null;
    const isNewChat = activeTab === "chat" && !activeId;

    const unreadRemindersCount = reminders.filter(r => r.status === "terkirim").length;

    return (
        <DashboardLayout>
            <style dangerouslySetInnerHTML={{ __html: CHAT_DOT_KEYFRAMES + EXTRA_KEYFRAMES }} />

            <div className="flex h-[calc(100vh-6rem)] sm:h-[calc(100vh-3.5rem)] -mx-4 -my-4 lg:mx-0 lg:my-0 w-[calc(100%+2rem)] lg:w-full bg-white text-gray-800 overflow-hidden font-sans rounded-none sm:rounded-2xl border-0 sm:border border-gray-200 shadow-xs">

                <aside className={`w-full sm:w-72 flex-shrink-0 bg-gray-50 border-r border-gray-200 flex-col ${(!activeId && !isNewChat) || (activeTab === "chat" && isNewChat) ? "flex" : "hidden sm:flex"}`}>
                    <div className="p-4 border-b border-gray-200 flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#1a1a2e] to-[#2d2d4a] flex items-center justify-center text-white shadow-sm flex-shrink-0">
                            <Sparkles className="w-4 h-4" />
                        </div>
                        <h1 className="text-sm font-bold text-[#1a1a2e] tracking-tight">Tanya CEO</h1>
                    </div>

                    <div className="px-4 py-3 border-b border-gray-200 bg-white">
                        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
                            <button
                                onClick={() => { setActiveTab("chat"); openThread(null, "conversation"); }}
                                className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all duration-200 ${activeTab === "chat" ? "bg-white text-gray-900 shadow-xs" : "text-gray-500 hover:text-gray-700"}`}
                            >
                                Chat
                            </button>
                            <button
                                onClick={() => { setActiveTab("pengingat"); openThread(null, "reminder"); }}
                                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold rounded-lg transition-all duration-200 ${activeTab === "pengingat" ? "bg-white text-gray-900 shadow-xs" : "text-gray-500 hover:text-gray-700"}`}
                            >
                                Pengingat
                                {unreadRemindersCount > 0 && (
                                    <span className="w-4 h-4 rounded-full bg-rose-500 text-white flex items-center justify-center text-[9px] font-bold">
                                        {unreadRemindersCount}
                                    </span>
                                )}
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
                        {loadingList && (
                            <div className="space-y-2 p-1">
                                {[0, 1, 2].map((i) => (
                                    <div key={i} className="h-16 rounded-xl bg-gray-100 animate-pulse" style={{ animationDelay: `${i * 120}ms` }} />
                                ))}
                            </div>
                        )}
                        {!loadingList && activeTab === "pengingat" && reminders.length === 0 && (
                            <div className="flex flex-col items-center text-center px-4 py-10">
                                <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                                    <Bell className="w-4 h-4 text-gray-300" />
                                </div>
                                <p className="text-xs text-gray-400">Belum ada pengingat dari CEO/admin.</p>
                            </div>
                        )}
                        {!loadingList && activeTab === "chat" && conversations.length === 0 && (
                            <div className="flex flex-col items-center text-center px-4 py-10">
                                <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                                    <Sparkles className="w-4 h-4 text-gray-300" />
                                </div>
                                <p className="text-xs text-gray-400">Mulai chat baru dengan AI CEO.</p>
                            </div>
                        )}

                        {activeTab === "chat" && (
                            <button
                                onClick={() => openThread(null, "conversation")}
                                className={`w-full flex items-center gap-2 text-left rounded-xl px-3 py-2.5 mb-2 border border-dashed transition-all duration-200 ${isNewChat ? "bg-blue-50 border-blue-300 text-blue-700" : "border-blue-200 text-blue-600 hover:bg-blue-50 hover:border-blue-300"}`}
                            >
                                <Plus className="w-3.5 h-3.5" />
                                <span className="text-xs font-bold">Chat Baru</span>
                            </button>
                        )}

                        {!loadingList && activeTab === "pengingat" && reminders.map((r) => {
                            const style = SEVERITY_STYLE[r.severity] ?? SEVERITY_STYLE.info;
                            const Icon = r.status === "selesai" ? CheckCircle2 : style.icon;
                            const unread = r.status === "terkirim";
                            const isActive = activeId === r.id;
                            return (
                                <button
                                    key={r.id}
                                    onClick={() => openThread(r.id, "reminder")}
                                    className={`w-full text-left rounded-xl p-3 transition-all duration-200 border ${isActive ? "bg-white border-[#1a1a2e] shadow-xs" : "border-transparent hover:bg-gray-100"}`}
                                >
                                    <div className="flex items-start gap-2.5">
                                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${r.status === "selesai" ? "bg-emerald-100" : style.bg}`}>
                                            <Icon className={`w-3.5 h-3.5 ${r.status === "selesai" ? "text-emerald-600" : style.text}`} />
                                        </div>
                                        <div className="min-w-0 flex-1 pt-0.5">
                                            <p className={`text-xs truncate ${unread ? "font-bold text-gray-900" : "font-medium text-gray-700"}`}>{r.title}</p>
                                            <p className="text-[11px] text-gray-400 mt-0.5">{STATUS_LABEL[r.status] ?? r.status}</p>
                                        </div>
                                        {unread && (
                                            <span className="relative flex-shrink-0 mt-1.5 w-2 h-2">
                                                <span className="absolute inset-0 rounded-full bg-rose-400" style={{ animation: "softPing 1.8s cubic-bezier(0,0,0.2,1) infinite" }} />
                                                <span className="relative block w-2 h-2 rounded-full bg-rose-500" />
                                            </span>
                                        )}
                                    </div>
                                </button>
                            );
                        })}

                        {!loadingList && activeTab === "chat" && conversations.map((c) => {
                            const isActive = activeId === c.id;
                            return (
                                <button
                                    key={c.id}
                                    onClick={() => openThread(c.id, "conversation")}
                                    className={`w-full text-left rounded-xl p-3 transition-all duration-200 border ${isActive ? "bg-white border-[#1a1a2e] shadow-xs" : "border-transparent hover:bg-gray-100"}`}
                                >
                                    <div className="flex items-center gap-2.5">
                                        <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                                            <Sparkles className="w-3.5 h-3.5 text-gray-400" />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-xs truncate font-semibold text-gray-900">{c.title}</p>
                                            <p className="text-[10px] text-gray-400 mt-0.5">{new Date(c.updated_at).toLocaleDateString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </aside>

                <main className={`flex-1 flex-col min-w-0 bg-white h-full ${activeId || isNewChat ? "flex" : "hidden sm:flex"}`}>
                    {!activeId && !isNewChat ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
                            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#1a1a2e] to-[#2d2d4a] flex items-center justify-center text-white shadow-lg mb-4">
                                <Sparkles className="w-6 h-6" />
                            </div>
                            <p className="text-sm font-medium text-gray-600 mb-1">Belum ada yang dipilih</p>
                            <p className="text-xs text-gray-400 max-w-[220px]">Pilih pesan di samping untuk mulai ngobrol.</p>
                        </div>
                    ) : (
                        <>
                            <header className="h-12 sm:h-14 px-3 sm:px-6 border-b border-gray-200 bg-white/90 backdrop-blur-sm flex items-center justify-between gap-2 flex-shrink-0 sticky top-0 z-10">
                                <div className="flex items-center gap-2 min-w-0">
                                    <button onClick={() => setActiveId(null)} className="sm:hidden p-1.5 -ml-1 rounded-xl text-gray-500 hover:bg-gray-100 transition-colors">
                                        <ArrowLeft className="w-4 h-4" />
                                    </button>
                                    <div className="min-w-0">
                                        <p className="text-xs sm:text-sm font-bold text-[#1a1a2e] tracking-tight truncate">
                                            {activeTab === "pengingat" ? activeReminder?.title : (activeConversation?.title || "Chat Baru")}
                                        </p>
                                        <p className="text-[10px] text-gray-400 uppercase tracking-wide font-medium">
                                            {activeTab === "pengingat" ? (STATUS_LABEL[activeReminder?.status ?? ""] ?? activeReminder?.status) : "AI Asisten Solit 03"}
                                        </p>
                                    </div>
                                </div>
                                {activeTab === "pengingat" && activeReminder && activeReminder.status !== "selesai" && (
                                    <button onClick={markSelesaiManual} className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 active:scale-95 transition-all duration-150 flex-shrink-0">
                                        <CheckCircle2 className="w-3 h-3" />
                                        Tandai Selesai
                                    </button>
                                )}
                            </header>

                            <div className="flex-1 overflow-y-auto px-3 sm:px-6 py-4 space-y-4 max-w-3xl mx-auto w-full">
                                {activeTab === "pengingat" && activeReminder && (() => {
                                    const s = SEVERITY_STYLE[activeReminder.severity] ?? SEVERITY_STYLE.info;
                                    const BannerIcon = s.icon;
                                    return (
                                        <div className={`flex items-start gap-2.5 rounded-2xl border p-3.5 text-xs sm:text-sm ${s.bg} ${s.border} ${s.text}`}>
                                            <BannerIcon className="w-4 h-4 flex-shrink-0 mt-0.5" />
                                            <p className="leading-relaxed">{activeReminder.message}</p>
                                        </div>
                                    );
                                })()}

                                {isNewChat && messages.length === 0 && (
                                    <div className="flex flex-col items-center justify-center pt-8 sm:pt-16 pb-4">
                                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#1a1a2e] to-[#3a3a5e] flex items-center justify-center text-white shadow-lg mb-4">
                                            <Sparkles className="w-6 h-6" />
                                        </div>
                                        <h2 className="text-base sm:text-lg font-bold text-gray-900 tracking-tight mb-2">Tanya Apa Saja</h2>
                                        <p className="text-xs sm:text-sm text-gray-500 text-center max-w-sm leading-relaxed">
                                            Silakan tanya soal stok, absensi, panduan kerja, atau apa saja seputar operasional Solit 03.
                                        </p>
                                    </div>
                                )}

                                {loadingThread && (
                                    <div className="space-y-3">
                                        <div className="h-4 w-2/3 rounded-full bg-gray-100 animate-pulse" />
                                        <div className="h-10 rounded-2xl bg-gray-100 animate-pulse" />
                                    </div>
                                )}

                                {messages.map((m, i) => (
                                    <div key={m.id ?? i} className={`flex gap-2 sm:gap-3 ${m.role === "user" ? "justify-end" : "justify-start"}`} style={{ animation: "messageIn 0.25s ease-out" }}>
                                        {m.role === "assistant" && (
                                            <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-[#1a1a2e] to-[#2d2d4a] flex items-center justify-center text-white shadow-xs flex-shrink-0 mt-0.5">
                                                <Sparkles className="w-3.5 h-3.5" />
                                            </div>
                                        )}
                                        <div className={`px-3.5 py-2.5 rounded-2xl text-xs sm:text-sm leading-relaxed max-w-[85%] ${m.role === "user" ? "bg-[#1a1a2e] text-white rounded-tr-xs shadow-xs" : "bg-gray-50 text-gray-800"}`}>
                                            {m.role === "user" ? <span className="whitespace-pre-wrap">{m.content}</span> : <MarkdownMessage content={m.content} />}
                                        </div>
                                    </div>
                                ))}

                                {sending && (
                                    <div className="flex gap-2 sm:gap-3 items-start" style={{ animation: "messageIn 0.25s ease-out" }}>
                                        <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-[#1a1a2e] to-[#2d2d4a] flex items-center justify-center text-white shadow-xs flex-shrink-0">
                                            <Sparkles className="w-3.5 h-3.5 animate-spin" />
                                        </div>
                                        <ThinkingIndicator label={thinkingLabel} />
                                    </div>
                                )}
                                <div ref={bottomRef} />
                            </div>

                            <div className="px-3 sm:px-6 py-3 bg-white border-t border-gray-100 flex-shrink-0">
                                <div className="max-w-3xl mx-auto relative rounded-2xl bg-white border border-gray-200 focus-within:border-[#1a1a2e] focus-within:ring-4 focus-within:ring-[#1a1a2e]/5 shadow-xs transition-all duration-200 p-2 sm:p-2.5 flex items-end gap-2">
                                    <textarea
                                        ref={textareaRef}
                                        value={input}
                                        onChange={(e) => {
                                            setInput(e.target.value);
                                            const el = textareaRef.current;
                                            if (el) { el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, 140) + "px"; }
                                        }}
                                        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                                        rows={1}
                                        placeholder={activeTab === "pengingat" ? "Balas atau tanya soal pengingat ini..." : "Tanya apa saja..."}
                                        className="flex-1 resize-none bg-transparent border-0 text-xs sm:text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-0 max-h-28 sm:max-h-36 px-1 py-1"
                                    />
                                    <button
                                        onClick={handleSend}
                                        disabled={sending || !input.trim()}
                                        className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-[#1a1a2e] hover:bg-[#2d2d4a] active:scale-90 disabled:bg-gray-200 text-white disabled:text-gray-400 flex items-center justify-center transition-all duration-150 flex-shrink-0 shadow-xs disabled:shadow-none"
                                    >
                                        <ArrowUp className="w-4 h-4 sm:w-5 sm:h-5" />
                                    </button>
                                </div>
                            </div>
                        </>
                    )}
                </main>
            </div>
        </DashboardLayout>
    );
}