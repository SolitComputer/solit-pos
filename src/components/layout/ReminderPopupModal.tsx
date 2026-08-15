// src/components/layout/ReminderPopupModal.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useCeoReminderNotify, CeoReminderItem } from "@/hooks/useReminderBadge";
import { AlertTriangle, Bell, Send, CheckCircle2, Sparkles, ExternalLink, X } from "lucide-react";

interface PopupMessage {
  id?: string;
  role: "user" | "assistant";
  content: string;
}

const SEVERITY_CONFIG: Record<string, { bg: string; border: string; text: string; headerBg: string; badgeText: string; icon: any }> = {
  info: {
    bg: "bg-blue-50/70",
    border: "border-blue-200",
    text: "text-blue-900",
    headerBg: "bg-gradient-to-r from-blue-600 to-indigo-700",
    badgeText: "Pemberitahuan",
    icon: Bell,
  },
  warning: {
    bg: "bg-amber-50/70",
    border: "border-amber-200",
    text: "text-amber-900",
    headerBg: "bg-gradient-to-r from-amber-600 to-orange-700",
    badgeText: "Peringatan",
    icon: AlertTriangle,
  },
  critical: {
    bg: "bg-rose-50/70",
    border: "border-rose-200",
    text: "text-rose-900",
    headerBg: "bg-gradient-to-r from-rose-600 to-red-700",
    badgeText: "Peringatan Krusial",
    icon: AlertTriangle,
  },
};

export function ReminderPopupModal({ userId }: { userId: string | null | undefined }) {
  const router = useRouter();
  const pathname = usePathname();
  const onTanyaCeo = pathname.startsWith("/dashboard/tanya-ceo");

  const { unreadItems, latestItem, dismissLatest, refresh } = useCeoReminderNotify(userId);
  const [activeReminder, setActiveReminder] = useState<CeoReminderItem | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  // Chat conversation state inside popup
  const [messages, setMessages] = useState<PopupMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [thinkingLabel, setThinkingLabel] = useState("Memikirkan jawaban...");
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const shownIdsRef = useRef<Set<string>>(new Set());

  // Trigger popup when new reminder is received
  useEffect(() => {
    if (onTanyaCeo) return;
    if (latestItem && !shownIdsRef.current.has(latestItem.id)) {
      setActiveReminder(latestItem);
      setIsOpen(true);
      shownIdsRef.current.add(latestItem.id);
    } else if (!activeReminder && unreadItems.length > 0) {
      const firstUnshown = unreadItems.find((r) => !shownIdsRef.current.has(r.id));
      if (firstUnshown) {
        setActiveReminder(firstUnshown);
        setIsOpen(true);
        shownIdsRef.current.add(firstUnshown.id);
      }
    }
  }, [latestItem, unreadItems, onTanyaCeo, activeReminder]);

  useEffect(() => {
    chatScrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  const handleClose = () => {
    setIsOpen(false);
    dismissLatest();
  };

  const handleGoToFullPage = () => {
    setIsOpen(false);
    dismissLatest();
    router.push("/dashboard/tanya-ceo");
  };

  const handleMarkSelesai = async () => {
    if (!activeReminder) return;
    try {
      await fetch(`/api/ai-assistant/reminders/${activeReminder.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "selesai" }),
      });
      refresh();
      handleClose();
    } catch {
      // silent
    }
  };

  const handleSendQuestion = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const text = input.trim();
    if (!text || sending || !activeReminder) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setSending(true);
    setThinkingLabel("Memikirkan jawaban...");

    try {
      const res = await fetch("/api/ai-assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, reminderId: activeReminder.id }),
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
          try {
            evt = JSON.parse(line);
          } catch {
            continue;
          }

          if (evt.type === "tool") {
            setThinkingLabel(
              evt.tool === "tandai_pengingat_selesai"
                ? "Menandai selesai..."
                : evt.tool === "eskalasi_ke_admin"
                ? "Mengirim ke admin..."
                : "Memproses..."
            );
          } else if (evt.type === "done") {
            setMessages((prev) => [...prev, { role: "assistant", content: evt.reply }]);
            refresh();
            finished = true;
          } else if (evt.type === "error") {
            setMessages((prev) => [...prev, { role: "assistant", content: `Gagal: ${evt.message}` }]);
            finished = true;
          }
        }
      }
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "Gagal menghubungi asisten, silakan coba lagi." }]);
    } finally {
      setSending(false);
    }
  };

  if (!isOpen || !activeReminder || onTanyaCeo) return null;

  const cfg = SEVERITY_CONFIG[activeReminder.severity] ?? SEVERITY_CONFIG.info;
  const IconComponent = cfg.icon;

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[80] flex items-end sm:items-end justify-center sm:justify-end p-3 sm:p-5"
      role="region"
      aria-label="Pemberitahuan Peringatan CEO"
    >
      <div
        className="pointer-events-auto w-full sm:max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden border border-gray-200 flex flex-col max-h-[85vh] sm:max-h-[75vh] animate-scaleUp"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Modal with Close (X) button */}
        <div className={`${cfg.headerBg} text-white px-4 py-3 sm:px-5 sm:py-3.5 flex items-center justify-between gap-3 flex-shrink-0`}>
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
              <IconComponent className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0">
              <span className="text-[10px] font-extrabold uppercase tracking-wider bg-white/25 px-2 py-0.5 rounded-full">
                {cfg.badgeText}
              </span>
              <h2 className="text-xs sm:text-sm font-bold text-white truncate mt-0.5">
                {activeReminder.title}
              </h2>
            </div>
          </div>

          {/* Tanda Silang (X) */}
          <button
            onClick={handleClose}
            className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl flex items-center justify-center text-white/80 hover:text-white hover:bg-white/20 active:scale-95 transition flex-shrink-0"
            aria-label="Tutup popup"
            title="Tutup (Nanti Saja)"
          >
            <X className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4">
          {/* Isi Pesan Peringatan */}
          <div className={`p-4 rounded-2xl border ${cfg.border} ${cfg.bg}`}>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
              Pesan dari Admin / CEO:
            </p>
            <p className="text-sm text-gray-800 leading-relaxed font-medium whitespace-pre-wrap">
              {activeReminder.message}
            </p>
          </div>

          {/* Chat Messages Log if member asked questions */}
          {messages.length > 0 && (
            <div className="space-y-2.5 pt-2 border-t border-gray-100">
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                Percakapan & Balasan:
              </p>
              {messages.map((m, idx) => (
                <div
                  key={idx}
                  className={`flex gap-2 ${m.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  {m.role === "assistant" && (
                    <div className="w-6 h-6 rounded-lg bg-[#1a1a2e] text-white flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Sparkles className="w-3 h-3" />
                    </div>
                  )}
                  <div
                    className={`text-xs px-3.5 py-2.5 rounded-2xl max-w-[85%] leading-relaxed ${
                      m.role === "user"
                        ? "bg-[#1a1a2e] text-white rounded-br-xs"
                        : "bg-gray-100 text-gray-800 rounded-bl-xs"
                    }`}
                  >
                    {m.content}
                  </div>
                </div>
              ))}

              {sending && (
                <div className="flex items-center gap-2 text-xs text-gray-500 italic py-1">
                  <span className="w-2 h-2 rounded-full bg-violet-600 animate-pulse" />
                  <span>{thinkingLabel}</span>
                </div>
              )}
              <div ref={chatScrollRef} />
            </div>
          )}

          {/* Form Buat Nanya / Membalas Langsung */}
          <form onSubmit={handleSendQuestion} className="space-y-2 pt-1">
            <label className="text-xs font-bold text-gray-700 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-violet-600" />
              <span>Ada pertanyaan atau mau balas langsung?</span>
            </label>
            <div className="flex gap-2 items-center">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ketik pertanyaan / konfirmasi kamu ke CEO..."
                className="flex-1 px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs sm:text-sm text-gray-800 focus:outline-none focus:border-[#1a1a2e] focus:bg-white transition"
                disabled={sending}
              />
              <button
                type="submit"
                disabled={!input.trim() || sending}
                className="h-10 px-4 bg-[#1a1a2e] text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-[#2a2a44] active:scale-95 disabled:opacity-40 transition flex-shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Kirim</span>
              </button>
            </div>
          </form>
        </div>

        {/* Footer Actions */}
        <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between gap-2 flex-wrap flex-shrink-0">
          <button
            onClick={handleMarkSelesai}
            className="px-3.5 py-2 rounded-xl text-xs font-bold text-emerald-700 bg-emerald-100/80 hover:bg-emerald-200/80 flex items-center gap-1.5 transition active:scale-95"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Tandai Selesai</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={handleClose}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold text-gray-600 hover:bg-gray-200/70 transition"
            >
              Nanti Saja
            </button>
            <button
              onClick={handleGoToFullPage}
              className="px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-[#1a1a2e] hover:bg-[#2a2a44] flex items-center gap-1.5 transition active:scale-95 shadow-sm"
            >
              <span>Halaman Tanya CEO</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
