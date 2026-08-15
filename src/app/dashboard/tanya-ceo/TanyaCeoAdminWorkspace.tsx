"use client";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/services/supabase";
import { MarkdownMessage } from "@/components/ai/ChatPrimitives";
import { AlertTriangle, Send, Inbox, User, Clock, CheckCircle2, Sparkles } from "lucide-react";

interface Escalation {
    id: string;
    category: string;
    title: string;
    description: string;
    severity: "info" | "warning" | "critical";
    status: string;
    created_at: string;
    conversation_id: string;
    users: { id: string; name: string; role: string } | null;
}

interface ChatMessage { id?: string; role: "user" | "assistant"; content: string; provider?: string; }

export default function TanyaCeoAdminWorkspace() {
    const [escalations, setEscalations] = useState<Escalation[]>([]);
    const [loadingList, setLoadingList] = useState(true);
    const [activeEscalation, setActiveEscalation] = useState<Escalation | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [loadingThread, setLoadingThread] = useState(false);
    const [input, setInput] = useState("");
    const [sending, setSending] = useState(false);
    const bottomRef = useRef<HTMLDivElement>(null);

    const loadEscalations = useCallback(async () => {
        try {
            setLoadingList(true);
            const res = await fetch("/api/ai-assistant/escalations");
            const json = await res.json();
            if (json.success) {
                setEscalations(json.data ?? []);
            }
        } catch (err) {
            console.error("Gagal mengambil eskalasi", err);
        } finally {
            setLoadingList(false);
        }
    }, []);

    useEffect(() => { loadEscalations(); }, [loadEscalations]);

    const openEscalation = async (esc: Escalation) => {
        setActiveEscalation(esc);
        if (!esc.conversation_id) {
            setMessages([]);
            return;
        }
        setLoadingThread(true);
        try {
            const res = await fetch(`/api/ai-assistant/conversations/${esc.conversation_id}`);
            const json = await res.json();
            if (json.success) {
                setMessages(json.messages.map((m: any) => ({ id: m.id, role: m.role, content: m.content, provider: m.provider })));
            }
        } catch (err) {
            console.error("Gagal load pesan", err);
        } finally {
            setLoadingThread(false);
        }
    };

    useEffect(() => {
        if (!activeEscalation?.conversation_id) return;
        
        const channelId = `admin_tanya_ceo_${activeEscalation.conversation_id}_${Math.random().toString(36).substring(2, 9)}`;
        const chan = supabase
            .channel(channelId)
            .on(
                "postgres_changes",
                {
                    event: "INSERT",
                    schema: "public",
                    table: "ai_ceo_messages",
                    filter: `conversation_id=eq.${activeEscalation.conversation_id}`,
                },
                (payload) => {
                    const row = payload.new as any;
                    setMessages((prev) => {
                        if (prev.some((m) => m.id === row.id)) return prev;
                        return [...prev, { id: row.id, role: row.role, content: row.content, provider: row.provider }];
                    });
                }
            )
            .subscribe();

        return () => { supabase.removeChannel(chan); };
    }, [activeEscalation?.conversation_id]);

    useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

    const handleSend = async () => {
        const text = input.trim();
        if (!text || sending || !activeEscalation) return;

        setInput("");
        setSending(true);

        // Optimistic UI
        const tempId = `temp_${Date.now()}`;
        setMessages((prev) => [...prev, { id: tempId, role: "assistant", content: text, provider: "system" }]);

        try {
            const res = await fetch(`/api/ai-assistant/escalations/${activeEscalation.id}/reply`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ jawaban: text }),
            });
            const json = await res.json();
            
            if (json.success) {
                // Update local status
                setEscalations(prev => prev.map(e => e.id === activeEscalation.id ? { ...e, status: "reviewed" } : e));
                setActiveEscalation(prev => prev ? { ...prev, status: "reviewed" } : null);
            } else {
                alert(`Gagal: ${json.message}`);
                // Revert optimistic if failed
                setMessages((prev) => prev.filter(m => m.id !== tempId));
            }
        } catch (err) {
            alert("Gagal mengirim pesan.");
            setMessages((prev) => prev.filter(m => m.id !== tempId));
        } finally {
            setSending(false);
        }
    };

    return (
        <DashboardLayout>
            <div className="flex h-[calc(100vh-6rem)] sm:h-[calc(100vh-3.5rem)] -mx-4 -my-4 lg:mx-0 lg:my-0 w-[calc(100%+2rem)] lg:w-full bg-white text-gray-800 overflow-hidden font-sans rounded-none sm:rounded-2xl border-0 sm:border border-gray-200 shadow-xs">
                
                {/* SIDEBAR INBOX */}
                <aside className={`w-full sm:w-80 flex-shrink-0 bg-gray-50 border-r border-gray-200 flex-col ${!activeEscalation ? "flex" : "hidden sm:flex"}`}>
                    <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-red-600 flex items-center justify-center text-white shadow-xs">
                                <Inbox className="w-4 h-4" />
                            </div>
                            <h1 className="text-[15px] font-bold text-gray-900">Inbox Eskalasi</h1>
                        </div>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto">
                        {loadingList ? (
                            <div className="p-6 text-center text-sm text-gray-500">Memuat antrean...</div>
                        ) : escalations.length === 0 ? (
                            <div className="p-6 text-center">
                                <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3 opacity-20" />
                                <p className="text-sm font-medium text-gray-600">Inbox Bersih</p>
                                <p className="text-xs text-gray-400 mt-1">Tidak ada pertanyaan member saat ini.</p>
                            </div>
                        ) : (
                            <ul className="divide-y divide-gray-200">
                                {escalations.map((esc) => {
                                    const isActive = activeEscalation?.id === esc.id;
                                    const isAnswered = esc.status === "reviewed";
                                    return (
                                        <li key={esc.id}>
                                            <button
                                                onClick={() => openEscalation(esc)}
                                                className={`w-full text-left p-4 hover:bg-gray-100 transition-colors ${isActive ? "bg-indigo-50/50 hover:bg-indigo-50/50" : ""} ${!isAnswered && !isActive ? "bg-white" : ""}`}
                                            >
                                                <div className="flex items-center justify-between mb-1.5">
                                                    <span className="text-xs font-bold text-gray-900 line-clamp-1">{esc.users?.name ?? "Unknown Member"}</span>
                                                    <span className="text-[10px] text-gray-400 flex-shrink-0">
                                                        {new Date(esc.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                </div>
                                                <div className="text-[11px] font-semibold text-gray-500 mb-1 line-clamp-1 flex items-center gap-1">
                                                    <User className="w-3 h-3" /> {esc.users?.role ?? "Role"}
                                                </div>
                                                <p className="text-xs text-gray-600 line-clamp-2 leading-relaxed">
                                                    {esc.description}
                                                </p>
                                                <div className="mt-2.5 flex items-center gap-2">
                                                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wider ${isAnswered ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                                                        {isAnswered ? "Dijawab" : "Pending"}
                                                    </span>
                                                </div>
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>
                </aside>

                {/* MAIN CHAT AREA */}
                <main className={`flex-1 flex-col bg-white ${activeEscalation ? "flex" : "hidden sm:flex"}`}>
                    {activeEscalation ? (
                        <>
                            {/* HEADER */}
                            <header className="h-16 border-b border-gray-200 px-4 flex items-center gap-3 shrink-0 bg-white/80 backdrop-blur-md sticky top-0 z-10">
                                <button onClick={() => setActiveEscalation(null)} className="sm:hidden p-2 -ml-2 rounded-lg text-gray-500 hover:bg-gray-100">
                                    <AlertTriangle className="w-5 h-5 rotate-90" /> {/* Simulating back arrow */}
                                </button>
                                <div>
                                    <h2 className="text-sm font-bold text-gray-900">{activeEscalation.users?.name ?? "Member"}</h2>
                                    <p className="text-xs text-gray-500">{activeEscalation.users?.role}</p>
                                </div>
                                <div className="ml-auto">
                                    <span className={`text-[10px] font-bold px-2 py-1 rounded-md uppercase tracking-wider ${activeEscalation.status === "reviewed" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                                        {activeEscalation.status === "reviewed" ? "Dijawab" : "Menunggu Balasan Admin"}
                                    </span>
                                </div>
                            </header>

                            {/* CHAT THREAD */}
                            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 bg-gray-50/50">
                                {loadingThread ? (
                                    <div className="flex justify-center py-10"><Clock className="w-5 h-5 text-gray-400 animate-spin" /></div>
                                ) : (
                                    messages.map((msg, i) => {
                                        const isAi = msg.role === "assistant";
                                        const isAdmin = isAi && msg.provider === "system";
                                        
                                        if (!isAi) {
                                            // USER MESSAGE
                                            return (
                                                <div key={msg.id ?? i} className="flex justify-end max-w-[85%] ml-auto">
                                                    <div className="bg-[#1a1a2e] text-white rounded-2xl rounded-tr-sm px-4 py-3 shadow-xs">
                                                        <div className="text-[13px] sm:text-sm whitespace-pre-wrap leading-relaxed">
                                                            {msg.content}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        }

                                        // AI OR ADMIN MESSAGE
                                        return (
                                            <div key={msg.id ?? i} className="flex max-w-[90%] gap-3">
                                                <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 shadow-xs ${isAdmin ? "bg-red-600 text-white" : "bg-gradient-to-br from-indigo-500 to-purple-600 text-white"}`}>
                                                    {isAdmin ? <User className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
                                                </div>
                                                <div className={`bg-white border border-gray-200 rounded-2xl rounded-tl-sm px-4 py-3 shadow-xs`}>
                                                    {isAdmin && <div className="text-[10px] font-bold text-red-600 mb-1 uppercase tracking-wider">Admin Live Chat</div>}
                                                    {!isAdmin && <div className="text-[10px] font-bold text-indigo-600 mb-1 uppercase tracking-wider">Asisten AI</div>}
                                                    <MarkdownMessage content={msg.content} />
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                                <div ref={bottomRef} />
                            </div>

                            {/* INPUT AREA */}
                            <div className="p-4 bg-white border-t border-gray-200">
                                {activeEscalation.status === "reviewed" && (
                                    <div className="mb-3 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-700 flex items-center gap-2">
                                        <CheckCircle2 className="w-4 h-4" />
                                        Eskalasi ini sudah dijawab. Anda tetap bisa mengirim pesan tambahan jika perlu.
                                    </div>
                                )}
                                <div className="relative max-w-4xl mx-auto flex items-end gap-2 bg-gray-50 border border-gray-300 rounded-2xl p-1.5 focus-within:bg-white focus-within:border-indigo-500 transition-all shadow-xs">
                                    <textarea
                                        value={input}
                                        onChange={(e) => setInput(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter" && !e.shiftKey) {
                                                e.preventDefault();
                                                handleSend();
                                            }
                                        }}
                                        placeholder="Ketik balasan Anda (sebagai Admin)..."
                                        className="flex-1 max-h-32 min-h-[44px] bg-transparent resize-none py-3 px-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none"
                                        rows={1}
                                    />
                                    <button
                                        onClick={handleSend}
                                        disabled={!input.trim() || sending}
                                        className="w-11 h-11 shrink-0 flex items-center justify-center rounded-xl bg-[#1a1a2e] text-white disabled:opacity-50 disabled:bg-gray-300 transition-colors"
                                    >
                                        <Send className="w-4 h-4 -ml-0.5" />
                                    </button>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                            <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center mb-4 border border-gray-100 shadow-xs">
                                <Inbox className="w-8 h-8 text-gray-300" />
                            </div>
                            <h2 className="text-base font-bold text-gray-800">Inbox Eskalasi</h2>
                            <p className="text-sm text-gray-500 mt-2 max-w-xs">Pilih percakapan dari daftar di sebelah kiri untuk melihat riwayat pesan dan membalas member.</p>
                        </div>
                    )}
                </main>
            </div>
        </DashboardLayout>
    );
}
