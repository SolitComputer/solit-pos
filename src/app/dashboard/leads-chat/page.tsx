"use client";

import { useEffect, useState, useCallback } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { MessageCircle, Plus, Trash2, Send, X } from "lucide-react";

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M22 12a10 10 0 10-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.4h-1.2c-1.2 0-1.6.8-1.6 1.6V12h2.8l-.4 2.9h-2.4v7A10 10 0 0022 12z" />
    </svg>
  );
}

interface WhatsappAccount { id: string; label: string; phone_number: string; status: "connecting" | "connected" | "disconnected" }
interface Conversation {
  id: string; channel_type: "WHATSAPP" | "FACEBOOK"; customer_identifier: string;
  customer_name: string | null; last_message_preview: string | null; unread_count: number;
}
interface Message { id: string; direction: "IN" | "OUT"; body: string | null; media_url: string | null }

function AddAccountModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [label, setLabel] = useState("");
  const [phone, setPhone] = useState("");
  const [step, setStep] = useState<"form" | "qr">("form");
  const [qr, setQr] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!label.trim() || !phone.trim()) { setError("Nama dan nomor WA wajib diisi"); return; }
    setSaving(true); setError("");
    try {
      const res = await fetch("/api/leads-chat/accounts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, phoneNumber: phone }),
      });
      const data = await res.json();
      if (!data.success) { setError(data.message); return; }
      setAccountId(data.account.id); setQr(data.qrImageBase64); setStep("qr");
    } catch { setError("Terjadi kesalahan saat menyambungkan"); }
    finally { setSaving(false); }
  };

  useEffect(() => {
    if (step !== "qr" || !accountId) return;
    const interval = setInterval(async () => {
      const res = await fetch(`/api/leads-chat/accounts/${accountId}/qr`);
      const data = await res.json();
      if (data.alreadyConnected) { clearInterval(interval); onAdded(); onClose(); }
      else if (data.qrImageBase64) setQr(data.qrImageBase64);
    }, 4000);
    return () => clearInterval(interval);
  }, [step, accountId, onAdded, onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400"><X className="w-4 h-4" /></button>
        <h3 className="font-black text-lg text-[#1a1a2e] mb-4">Sambungkan Nomor WA</h3>
        {step === "form" ? (
          <div className="space-y-3">
            {error && <p className="text-xs text-red-600 font-semibold">{error}</p>}
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label, mis. CS 1 - Solit 03"
              className="w-full h-11 rounded-xl border border-gray-200 px-3.5 text-sm" />
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Nomor WA, mis. 628123456789"
              className="w-full h-11 rounded-xl border border-gray-200 px-3.5 text-sm" />
            <button onClick={submit} disabled={saving}
              className="w-full h-11 rounded-xl bg-[#1a1a2e] text-white font-bold text-sm disabled:opacity-50">
              {saving ? "Menyambungkan..." : "Lanjut, Munculkan QR"}
            </button>
          </div>
        ) : (
          <div className="text-center space-y-3">
            <p className="text-xs text-gray-500">Scan QR ini pakai WhatsApp di HP nomor tersebut (Perangkat Tertaut)</p>
            {qr ? <img src={`data:image/png;base64,${qr}`} alt="QR WhatsApp" className="mx-auto w-48 h-48 rounded-xl border" />
              : <div className="w-48 h-48 mx-auto rounded-xl bg-gray-100 animate-pulse" />}
            <p className="text-[11px] text-gray-400">Menunggu koneksi... halaman ini otomatis tertutup setelah tersambung.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function AccountsPanel({ onClose }: { onClose: () => void }) {
  const [accounts, setAccounts] = useState<WhatsappAccount[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<WhatsappAccount | null>(null);

  const fetchAccounts = useCallback(async () => {
    const res = await fetch("/api/leads-chat/accounts");
    const data = await res.json();
    if (data.success) setAccounts(data.accounts);
  }, []);
  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);

  const handleDelete = async () => {
    if (!confirmDelete) return;
    await fetch(`/api/leads-chat/accounts/${confirmDelete.id}`, { method: "DELETE" });
    setConfirmDelete(null); fetchAccounts();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-black text-lg text-[#1a1a2e]">Nomor WhatsApp Tersambung</h3>
          <button onClick={onClose}><X className="w-4 h-4 text-gray-400" /></button>
        </div>
        <button onClick={() => setShowAdd(true)}
          className="w-full h-10 rounded-xl bg-[#1a1a2e] text-white text-xs font-bold flex items-center justify-center gap-1.5 mb-4">
          <Plus className="w-3.5 h-3.5" /> Sambungkan Nomor Baru
        </button>
        <div className="space-y-2">
          {accounts.map((acc) => (
            <div key={acc.id} className="flex items-center justify-between px-3.5 py-2.5 rounded-xl border border-gray-100">
              <div>
                <p className="text-sm font-bold text-gray-800">{acc.label}</p>
                <p className="text-[11px] text-gray-400">{acc.phone_number}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${acc.status === "connected" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                  {acc.status === "connected" ? "Tersambung" : "Menunggu"}
                </span>
                <button onClick={() => setConfirmDelete(acc)} className="text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          ))}
          {accounts.length === 0 && <p className="text-xs text-gray-400 text-center py-6">Belum ada nomor tersambung</p>}
        </div>
        {showAdd && <AddAccountModal onClose={() => setShowAdd(false)} onAdded={fetchAccounts} />}
        {confirmDelete && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50" onClick={() => setConfirmDelete(null)} />
            <div className="relative bg-white rounded-2xl p-5 max-w-xs w-full">
              <p className="text-sm font-bold text-gray-800 mb-1">Hapus {confirmDelete.label}?</p>
              <p className="text-xs text-gray-400 mb-4">Chat yang sudah masuk tetap tersimpan, nomor ini cuma berhenti nerima chat baru.</p>
              <div className="flex gap-2">
                <button onClick={() => setConfirmDelete(null)} className="flex-1 h-9 rounded-xl bg-gray-100 text-xs font-semibold">Batal</button>
                <button onClick={handleDelete} className="flex-1 h-9 rounded-xl bg-red-600 text-white text-xs font-bold">Ya, Hapus</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function LeadsChatPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeChannel, setActiveChannel] = useState<"ALL" | "WHATSAPP" | "FACEBOOK">("ALL");
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [showAccounts, setShowAccounts] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchConversations = useCallback(async () => {
    const qs = activeChannel !== "ALL" ? `?channel=${activeChannel}` : "";
    const res = await fetch(`/api/leads-chat/conversations${qs}`);
    const data = await res.json();
    if (data.success) setConversations(data.conversations);
    setLoading(false);
  }, [activeChannel]);

  useEffect(() => {
    fetchConversations();
    const interval = setInterval(fetchConversations, 10000);
    return () => clearInterval(interval);
  }, [fetchConversations]);

  const openConversation = async (conv: Conversation) => {
    setSelected(conv);
    const res = await fetch(`/api/leads-chat/conversations/${conv.id}/messages`);
    const data = await res.json();
    if (data.success) setMessages(data.messages);
    fetchConversations();
  };

  const sendReply = async () => {
    if (!selected || !replyText.trim()) return;
    setSending(true);
    try {
      const res = await fetch(`/api/leads-chat/conversations/${selected.id}/messages`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: replyText }),
      });
      const data = await res.json();
      if (data.success) { setReplyText(""); openConversation(selected); }
    } finally { setSending(false); }
  };

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-[#F7F7F8] p-3 sm:p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-[#1a1a2e]">Leads Chat Masuk</h1>
              <p className="text-xs text-gray-400 mt-0.5">Semua chat WhatsApp & Facebook customer, satu tempat</p>
            </div>
            <button onClick={() => setShowAccounts(true)}
              className="h-10 px-4 rounded-xl bg-[#1a1a2e] text-white text-xs font-bold flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5" /> Kelola Nomor
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden flex" style={{ height: "calc(100vh - 200px)" }}>
            <div className="w-full sm:w-80 border-r border-gray-100 flex flex-col flex-shrink-0">
              <div className="flex gap-1.5 p-3 border-b border-gray-100">
                {([
                  { key: "ALL", label: "Semua", icon: null },
                  { key: "WHATSAPP", label: "WhatsApp", icon: <MessageCircle className="w-3 h-3" /> },
                  { key: "FACEBOOK", label: "Facebook", icon: <FacebookIcon className="w-3 h-3" /> },
                ] as const).map((t) => (
                  <button key={t.key} onClick={() => setActiveChannel(t.key)}
                    className={`flex-1 h-8 rounded-lg text-[10.5px] font-bold flex items-center justify-center gap-1 ${activeChannel === t.key ? "bg-[#1a1a2e] text-white" : "bg-gray-50 text-gray-500"}`}>
                    {t.icon}{t.label}
                  </button>
                ))}
              </div>
              <div className="flex-1 overflow-y-auto">
                {loading ? <p className="text-xs text-gray-400 text-center py-8">Memuat...</p>
                  : conversations.length === 0 ? <p className="text-xs text-gray-400 text-center py-8">Belum ada chat masuk</p>
                  : conversations.map((c) => (
                    <button key={c.id} onClick={() => openConversation(c)}
                      className={`w-full text-left px-3.5 py-3 border-b border-gray-50 hover:bg-gray-50 flex items-start gap-2.5 ${selected?.id === c.id ? "bg-violet-50" : ""}`}>
                      <div className="w-9 h-9 rounded-full bg-[#1a1a2e] text-white flex items-center justify-center text-[10px] font-black flex-shrink-0">
                        {(c.customer_name || c.customer_identifier).slice(0, 2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-bold text-gray-800 truncate">{c.customer_name || c.customer_identifier}</p>
                          {c.unread_count > 0 && (
                            <span className="w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-black flex items-center justify-center flex-shrink-0">{c.unread_count}</span>
                          )}
                        </div>
                        <p className="text-[10.5px] text-gray-400 truncate">{c.last_message_preview || "-"}</p>
                      </div>
                    </button>
                  ))}
              </div>
            </div>

            <div className="hidden sm:flex flex-1 flex-col">
              {!selected ? (
                <div className="flex-1 flex items-center justify-center text-gray-300 text-sm">Pilih percakapan di sebelah kiri</div>
              ) : (
                <>
                  <div className="px-4 py-3 border-b border-gray-100">
                    <p className="text-sm font-bold text-gray-800">{selected.customer_name || selected.customer_identifier}</p>
                    <p className="text-[10.5px] text-gray-400">{selected.customer_identifier}</p>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    {messages.map((m) => (
                      <div key={m.id} className={`flex ${m.direction === "OUT" ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[70%] px-3.5 py-2 rounded-2xl text-xs ${m.direction === "OUT" ? "bg-[#1a1a2e] text-white" : "bg-gray-100 text-gray-800"}`}>
                          {m.body}
                          {m.media_url && <img src={m.media_url} className="mt-1.5 rounded-lg max-w-full" />}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="p-3 border-t border-gray-100 flex gap-2">
                    <input value={replyText} onChange={(e) => setReplyText(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && sendReply()} placeholder="Ketik balasan..."
                      className="flex-1 h-10 rounded-xl border border-gray-200 px-3.5 text-xs" />
                    <button onClick={sendReply} disabled={sending}
                      className="w-10 h-10 rounded-xl bg-[#1a1a2e] text-white flex items-center justify-center disabled:opacity-50">
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
      {showAccounts && <AccountsPanel onClose={() => setShowAccounts(false)} />}
    </DashboardLayout>
  );
}