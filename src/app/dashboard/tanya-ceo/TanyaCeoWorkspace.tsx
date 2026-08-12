"use client";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useEffect, useRef, useState, useCallback } from "react";
import { ThinkingIndicator, MarkdownMessage, CHAT_DOT_KEYFRAMES } from "@/components/ai/ChatPrimitives";
import { Sparkles, ArrowUp, ArrowLeft, CheckCircle2, AlertTriangle, Bell } from "lucide-react";

interface ReminderSummary {
    id: string;
    title: string;
    message: string;
    severity: "info" | "warning" | "critical";
    status: "terkirim" | "dibaca" | "dibalas" | "selesai" | "diabaikan";
    created_at: string;
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

export default function TanyaCeoWorkspace() {
    const [reminders, setReminders] = useState<ReminderSummary[]>([]);
    const [loadingList, setLoadingList] = useState(true);
    const [activeId, setActiveId] = useState<string | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState("");
    const [sending, setSending] = useState(false);
    const [thinkingLabel, setThinkingLabel] = useState("Memikirkan jawaban...");
    const [loadingThread, setLoadingThread] = useState(false);

    const bottomRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const loadReminders = useCallback(async () => {
        try {
            const res = await fetch("/api/ai-assistant/reminders");
            const json = await res.json();
            if (json.success) setReminders(json.data);
        } catch { } finally {
            setLoadingList(false);
        }
    }, []);

    useEffect(() => { loadReminders(); }, [loadReminders]);
    useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, sending]);

    const openReminder = useCallback(async (id: string) => {
        setActiveId(id);
        setLoadingThread(true);
        try {
            const res = await fetch(`/api/ai-assistant/reminders/${id}`);
            const json = await res.json();
            if (json.success) {
                setMessages(json.messages.map((m: any) => ({ id: m.id, role: m.role, content: m.content })));
                setReminders((prev) => prev.map((r) => (r.id === id && r.status === "terkirim" ? { ...r, status: "dibaca" } : r)));
            }
        } catch { } finally {
            setLoadingThread(false);
        }
    }, []);

    const handleSend = async () => {
        const text = input.trim();
        if (!text || sending || !activeId) return;

        setInput("");
        if (textareaRef.current) textareaRef.current.style.height = "auto";
        setMessages((prev) => [...prev, { role: "user", content: text }]);
        setSending(true);
        setThinkingLabel("Memikirkan jawaban...");

        try {
            const res = await fetch("/api/ai-assistant/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: text, reminderId: activeId }),
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
                        setMessages((prev) => [...prev, { role: "assistant", content: evt.reply }]);
                        loadReminders();
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
        if (!activeId) return;
        await fetch(`/api/ai-assistant/reminders/${activeId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "selesai" }),
        });
        setReminders((prev) => prev.map((r) => (r.id === activeId ? { ...r, status: "selesai" } : r)));
    };

    const activeReminder = reminders.find((r) => r.id === activeId) ?? null;

    return (
        <DashboardLayout>
            <style dangerouslySetInnerHTML={{ __html: CHAT_DOT_KEYFRAMES }} />

            <div className="flex h-[calc(100vh-6rem)] sm:h-[calc(100vh-3.5rem)] -mx-4 -my-4 lg:mx-0 lg:my-0 w-[calc(100%+2rem)] lg:w-full bg-white text-gray-800 overflow-hidden font-sans rounded-none sm:rounded-2xl border-0 sm:border border-gray-200 shadow-xs">

                <aside className={`w-full sm:w-72 flex-shrink-0 bg-gray-50 border-r border-gray-200 flex-col ${activeId ? "hidden sm:flex" : "flex"}`}>
                    <div className="p-4 border-b border-gray-200 flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-[#1a1a2e] flex items-center justify-center text-white shadow-xs flex-shrink-0">
                            <Sparkles className="w-3.5 h-3.5" />
                        </div>
                        <h1 className="text-sm font-bold text-[#1a1a2e]">Tanya CEO</h1>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 space-y-1">
                        {loadingList && (
                            <div className="space-y-2 p-2">
                                {[1, 2, 3].map((i) => <div key={i} className="h-16 rounded-xl bg-gray-100 animate-pulse" />)}
                            </div>
                        )}
                        {!loadingList && reminders.length === 0 && (
                            <p className="text-xs text-gray-400 italic px-3 py-6 text-center">Belum ada pengingat dari CEO/admin.</p>
                        )}
                        {reminders.map((r) => {
                            const style = SEVERITY_STYLE[r.severity] ?? SEVERITY_STYLE.info;
                            const Icon = r.status === "selesai" ? CheckCircle2 : style.icon;
                            const unread = r.status === "terkirim";
                            return (
                                <button
                                    key={r.id}
                                    onClick={() => openReminder(r.id)}
                                    className={`w-full text-left rounded-xl p-3 transition border ${activeId === r.id ? "bg-white border-[#1a1a2e] shadow-xs" : "border-transparent hover:bg-gray-100"}`}
                                >
                                    <div className="flex items-start gap-2">
                                        <Icon className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${r.status === "selesai" ? "text-emerald-600" : style.text}`} />
                                        <div className="min-w-0 flex-1">
                                            <p className={`text-xs truncate ${unread ? "font-bold text-gray-900" : "font-medium text-gray-700"}`}>{r.title}</p>
                                            <p className="text-[11px] text-gray-400 mt-0.5">{STATUS_LABEL[r.status] ?? r.status}</p>
                                        </div>
                                        {unread && <span className="w-2 h-2 rounded-full bg-rose-500 flex-shrink-0 mt-1" />}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </aside>

                <main className={`flex-1 flex-col min-w-0 bg-white h-full ${activeId ? "flex" : "hidden sm:flex"}`}>
                    {!activeReminder ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
                            <div className="w-10 h-10 rounded-2xl bg-[#1a1a2e] flex items-center justify-center text-white shadow-md mb-3">
                                <Sparkles className="w-5 h-5" />
                            </div>
                            <p className="text-sm text-gray-500">Pilih pengingat di samping untuk mulai ngobrol.</p>
                        </div>
                    ) : (
                        <>
                            <header className="h-12 sm:h-14 px-3 sm:px-6 border-b border-gray-200 bg-white flex items-center justify-between gap-2 flex-shrink-0">
                                <div className="flex items-center gap-2 min-w-0">
                                    <button onClick={() => setActiveId(null)} className="sm:hidden p-1.5 rounded-xl text-gray-600 hover:bg-gray-100">
                                        <ArrowLeft className="w-4 h-4" />
                                    </button>
                                    <div className="min-w-0">
                                        <p className="text-xs sm:text-sm font-bold text-[#1a1a2e] truncate">{activeReminder.title}</p>
                                        <p className="text-[10px] text-gray-400">{STATUS_LABEL[activeReminder.status] ?? activeReminder.status}</p>
                                    </div>
                                </div>
                                {activeReminder.status !== "selesai" && (
                                    <button onClick={markSelesaiManual} className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition flex-shrink-0">
                                        Tandai Selesai
                                    </button>
                                )}
                            </header>

                            <div className="flex-1 overflow-y-auto px-3 sm:px-6 py-4 space-y-4 max-w-3xl mx-auto w-full">
                                <div className={`rounded-2xl border p-3 text-xs sm:text-sm ${SEVERITY_STYLE[activeReminder.severity]?.bg} ${SEVERITY_STYLE[activeReminder.severity]?.border} ${SEVERITY_STYLE[activeReminder.severity]?.text}`}>
                                    {activeReminder.message}
                                </div>

                                {loadingThread && <div className="h-10 rounded-xl bg-gray-100 animate-pulse" />}

                                {messages.map((m, i) => (
                                    <div key={m.id ?? i} className={`flex gap-2 sm:gap-3 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                                        {m.role === "assistant" && (
                                            <div className="w-7 h-7 rounded-xl bg-[#1a1a2e] flex items-center justify-center text-white shadow-xs flex-shrink-0 mt-0.5">
                                                <Sparkles className="w-3.5 h-3.5" />
                                            </div>
                                        )}
                                        <div className={`px-3.5 py-2 rounded-2xl text-xs sm:text-sm leading-relaxed max-w-[85%] ${m.role === "user" ? "bg-[#1a1a2e] text-white rounded-tr-xs" : "bg-transparent text-gray-800"}`}>
                                            {m.role === "user" ? <span className="whitespace-pre-wrap">{m.content}</span> : <MarkdownMessage content={m.content} />}
                                        </div>
                                    </div>
                                ))}

                                {sending && (
                                    <div className="flex gap-2 sm:gap-3 items-start">
                                        <div className="w-7 h-7 rounded-xl bg-[#1a1a2e] flex items-center justify-center text-white shadow-xs flex-shrink-0">
                                            <Sparkles className="w-3.5 h-3.5 animate-spin" />
                                        </div>
                                        <ThinkingIndicator label={thinkingLabel} />
                                    </div>
                                )}
                                <div ref={bottomRef} />
                            </div>

                            <div className="px-3 sm:px-6 py-2 bg-white border-t border-gray-100 flex-shrink-0">
                                <div className="max-w-3xl mx-auto relative rounded-2xl bg-white border border-gray-200 focus-within:border-[#1a1a2e] shadow-xs p-2 sm:p-2.5 flex items-end gap-2">
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
                                        placeholder="Balas atau tanya soal pengingat ini..."
                                        className="flex-1 resize-none bg-transparent border-0 text-xs sm:text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-0 max-h-28 sm:max-h-36 px-1 py-1"
                                    />
                                    <button
                                        onClick={handleSend}
                                        disabled={sending || !input.trim()}
                                        className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-[#1a1a2e] hover:bg-[#2d2d4a] disabled:bg-gray-200 text-white disabled:text-gray-400 flex items-center justify-center transition flex-shrink-0"
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