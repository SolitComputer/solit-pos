"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { MessageCircle, Plus, Trash2, Send, X, RefreshCw, Paperclip, MoreVertical, Copy, PencilLine } from "lucide-react";

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M22 12a10 10 0 10-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.4h-1.2c-1.2 0-1.6.8-1.6 1.6V12h2.8l-.4 2.9h-2.4v7A10 10 0 0022 12z" />
    </svg>
  );
}

function MessageTicks({ status }: { status: string | null }) {
  if (!status) {
    return (
      <svg width="14" height="10" viewBox="0 0 16 11" fill="none" className="inline-block align-middle">
        <path d="M1 5.5L5 9.5L11 1.5" stroke="#8696a0" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  const isRead = /read/i.test(status);
  const color = isRead ? "#53bdeb" : "#8696a0";
  return (
    <svg width="18" height="10" viewBox="0 0 20 11" fill="none" className="inline-block align-middle">
      <path d="M1 5.5L5 9.5L11 1.5" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 5.5L10 9.5L19 0.5" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

interface WhatsappAccount { id: string; label: string; phone_number: string; status: "connecting" | "connected" | "disconnected" }
interface Conversation {
  id: string; channel_type: "WHATSAPP" | "FACEBOOK"; customer_identifier: string;
  customer_name: string | null; last_message_preview: string | null; unread_count: number;
  whatsapp_accounts: { label: string; phone_number: string } | null;
}
interface Message {
  id: string; direction: "IN" | "OUT"; body: string | null; media_url: string | null;
  delivery_status: string | null; deleted_at: string | null; deleted_scope: "me" | "everyone" | null;
}

function AddAccountModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [label, setLabel] = useState("");
  const [phone, setPhone] = useState("");
  const [step, setStep] = useState<"form" | "qr">("form");
  const [qr, setQr] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [qrError, setQrError] = useState("");

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
      if (!data.account?.id) { setError("Akun berhasil dibuat tapi server tidak mengembalikan ID-nya."); return; }
      setAccountId(data.account.id); setQr(data.qrImageBase64); setStep("qr");
      if (!data.qrImageBase64) setQrError("Menunggu QR dari Fonnte...");
    } catch { setError("Terjadi kesalahan saat menyambungkan"); }
    finally { setSaving(false); }
  };

  useEffect(() => {
    if (step !== "qr" || !accountId || accountId === "undefined") {
      if (step === "qr") setQrError("Gagal mendapatkan ID akun dari server — tutup modal ini dan coba lagi.");
      return;
    }
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/leads-chat/accounts/${accountId}/qr`);
        const data = await res.json();
        if (data.alreadyConnected) { clearInterval(interval); onAdded(); onClose(); }
        else if (data.qrImageBase64) { setQr(data.qrImageBase64); setQrError(""); }
        else if (res.status === 404) { clearInterval(interval); setQrError(data.message ?? "Akun sudah tidak ada — tutup dan coba lagi"); }
        else if (!data.success) { setQrError(data.message ?? "Gagal ambil QR dari Fonnte"); }
      } catch { setQrError("Gagal menghubungi server — coba tutup modal dan ulangi."); }
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
            {qrError && <p className="text-[11px] text-red-500 font-semibold">{qrError}</p>}
            <p className="text-[11px] text-gray-400">Menunggu koneksi... halaman ini otomatis tertutup setelah tersambung.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function ImportDeviceModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [label, setLabel] = useState("");
  const [phone, setPhone] = useState("");
  const [token, setToken] = useState("");
  const [step, setStep] = useState<"form" | "qr">("form");
  const [qr, setQr] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [qrError, setQrError] = useState("");

  const submit = async () => {
    if (!label.trim() || !phone.trim() || !token.trim()) { setError("Semua field wajib diisi"); return; }
    setSaving(true); setError("");
    try {
      const res = await fetch("/api/leads-chat/accounts/import", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, phoneNumber: phone, deviceToken: token }),
      });
      const data = await res.json();
      if (!data.success) { setError(data.message); return; }
      if (data.alreadyConnected) { onImported(); onClose(); return; }
      if (!data.account?.id) { setError("Akun berhasil dibuat tapi server tidak mengembalikan ID-nya."); return; }
      setAccountId(data.account.id); setQr(data.qrImageBase64); setStep("qr");
      if (!data.qrImageBase64) setQrError("Menunggu QR dari Fonnte...");
    } catch { setError("Terjadi kesalahan"); }
    finally { setSaving(false); }
  };

  useEffect(() => {
    if (step !== "qr" || !accountId || accountId === "undefined") {
      if (step === "qr") setQrError("Gagal mendapatkan ID akun dari server — tutup modal ini dan coba lagi.");
      return;
    }
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/leads-chat/accounts/${accountId}/qr`);
        const data = await res.json();
        if (data.alreadyConnected) { clearInterval(interval); onImported(); onClose(); }
        else if (data.qrImageBase64) { setQr(data.qrImageBase64); setQrError(""); }
        else if (res.status === 404) { clearInterval(interval); setQrError(data.message ?? "Akun sudah tidak ada — tutup dan coba lagi"); }
        else if (!data.success) { setQrError(data.message ?? "Gagal ambil QR dari Fonnte"); }
      } catch { setQrError("Gagal menghubungi server — coba tutup modal dan ulangi."); }
    }, 4000);
    return () => clearInterval(interval);
  }, [step, accountId, onImported, onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400"><X className="w-4 h-4" /></button>
        {step === "form" ? (
          <>
            <h3 className="font-black text-lg text-[#1a1a2e] mb-1">Sambungkan Nomor Pakai Token</h3>
            <p className="text-[11px] text-gray-400 mb-4">Buat nomor yang sudah punya device di Fonnte. Ambil token dari tombol "Token" di baris device tersebut.</p>
            <div className="space-y-3">
              {error && <p className="text-xs text-red-600 font-semibold">{error}</p>}
              <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label, mis. Solit03-WA"
                className="w-full h-11 rounded-xl border border-gray-200 px-3.5 text-sm" />
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Nomor WA, mis. 085178277591"
                className="w-full h-11 rounded-xl border border-gray-200 px-3.5 text-sm" />
              <input value={token} onChange={(e) => setToken(e.target.value)} placeholder="Device Token dari Fonnte"
                className="w-full h-11 rounded-xl border border-gray-200 px-3.5 text-sm font-mono" />
              <button onClick={submit} disabled={saving}
                className="w-full h-11 rounded-xl bg-[#1a1a2e] text-white font-bold text-sm disabled:opacity-50">
                {saving ? "Memeriksa..." : "Lanjut"}
              </button>
            </div>
          </>
        ) : (
          <>
            <h3 className="font-black text-lg text-[#1a1a2e] mb-4">Scan QR di WhatsApp</h3>
            <div className="text-center space-y-3">
              <p className="text-xs text-gray-500">Device ini belum connect — scan QR pakai WhatsApp di HP nomor tersebut</p>
              {qr ? <img src={`data:image/png;base64,${qr}`} alt="QR WhatsApp" className="mx-auto w-48 h-48 rounded-xl border" />
                : <div className="w-48 h-48 mx-auto rounded-xl bg-gray-100 animate-pulse" />}
              {qrError && <p className="text-[11px] text-red-500 font-semibold">{qrError}</p>}
              <p className="text-[11px] text-gray-400">Menunggu koneksi... halaman ini otomatis tertutup setelah tersambung.</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function AccountsPanel({ onClose }: { onClose: () => void }) {
  const [accounts, setAccounts] = useState<WhatsappAccount[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<WhatsappAccount | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [refreshMsg, setRefreshMsg] = useState("");

  const fetchAccounts = useCallback(async () => {
    const res = await fetch("/api/leads-chat/accounts");
    const data = await res.json();
    if (data.success) setAccounts(data.accounts);
  }, []);
  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);

  const handleSync = async () => {
    setSyncing(true); setSyncMsg("");
    try {
      const res = await fetch("/api/leads-chat/accounts/sync", { method: "POST" });
      const data = await res.json();
      if (data.success) { setSyncMsg(`${data.imported.length} nomor baru ditarik, ${data.skipped.length} sudah ada`); fetchAccounts(); }
      else setSyncMsg(data.message ?? "Gagal sync");
    } catch { setSyncMsg("Terjadi kesalahan saat sync"); }
    finally { setSyncing(false); }
  };

  const handleRefreshWebhook = async (id: string) => {
    setRefreshingId(id); setRefreshMsg("");
    try {
      const res = await fetch(`/api/leads-chat/accounts/${id}/refresh-webhook`, { method: "POST" });
      const data = await res.json();
      setRefreshMsg(data.success ? "Pengaturan webhook di-refresh — centang biru mulai aktif dari sekarang" : (data.message ?? "Gagal refresh"));
    } catch { setRefreshMsg("Terjadi kesalahan saat refresh"); }
    finally { setRefreshingId(null); }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setDeleteError("");
    try {
      const res = await fetch(`/api/leads-chat/accounts/${confirmDelete.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok && res.status !== 404) { setDeleteError(data?.message ?? `Gagal hapus (status ${res.status})`); return; }
      setConfirmDelete(null); fetchAccounts();
    } catch { setDeleteError("Terjadi kesalahan jaringan saat hapus"); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-black text-lg text-[#1a1a2e]">Nomor WhatsApp Tersambung</h3>
          <button onClick={onClose}><X className="w-4 h-4 text-gray-400" /></button>
        </div>
        <div className="flex gap-2 mb-1">
          <button onClick={() => setShowAdd(true)}
            className="flex-1 h-10 rounded-xl bg-[#1a1a2e] text-white text-xs font-bold flex items-center justify-center gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Nomor Baru
          </button>
          <button onClick={handleSync} disabled={syncing}
            className="flex-1 h-10 rounded-xl bg-emerald-600 text-white text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-50">
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} /> {syncing ? "Sinkron..." : "Sync dari Fonnte"}
          </button>
        </div>
        {syncMsg && <p className="text-[10.5px] text-gray-400 text-center mb-2 mt-1.5">{syncMsg}</p>}
        {refreshMsg && <p className="text-[10.5px] text-emerald-600 text-center mb-2">{refreshMsg}</p>}
        <button onClick={() => setShowImport(true)}
          className="w-full text-center text-[11px] font-semibold text-violet-600 hover:underline mb-4">
          Sudah punya nomor connect di Fonnte? Import pakai Token →
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
                <button onClick={() => handleRefreshWebhook(acc.id)} disabled={refreshingId === acc.id} title="Refresh pengaturan webhook (aktifkan centang biru)" className="text-gray-400 hover:text-violet-600">
                  <RefreshCw className={`w-3.5 h-3.5 ${refreshingId === acc.id ? "animate-spin" : ""}`} />
                </button>
                <button onClick={() => { setConfirmDelete(acc); setDeleteError(""); }} className="text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          ))}
          {accounts.length === 0 && <p className="text-xs text-gray-400 text-center py-6">Belum ada nomor tersambung</p>}
        </div>
        {showAdd && <AddAccountModal onClose={() => setShowAdd(false)} onAdded={fetchAccounts} />}
        {showImport && <ImportDeviceModal onClose={() => setShowImport(false)} onImported={fetchAccounts} />}
        {confirmDelete && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50" onClick={() => setConfirmDelete(null)} />
            <div className="relative bg-white rounded-2xl p-5 max-w-xs w-full">
              <p className="text-sm font-bold text-gray-800 mb-1">Hapus {confirmDelete.label}?</p>
              <p className="text-xs text-gray-400 mb-2">Chat yang sudah masuk tetap tersimpan, nomor ini cuma berhenti nerima chat baru.</p>
              {deleteError && <p className="text-xs text-red-600 font-semibold mb-2">{deleteError}</p>}
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

function MessageBubble({ m, isOpen, onToggleMenu, onCopy, onDelete, onCopyToInput }: {
  m: Message; isOpen: boolean; onToggleMenu: () => void;
  onCopy: () => void; onDelete: (scope: "me" | "everyone") => void; onCopyToInput: () => void;
}) {
  const isOut = m.direction === "OUT";
  if (m.deleted_at) {
    return (
      <div className={`flex ${isOut ? "justify-end" : "justify-start"}`}>
        <div className="max-w-[70%] px-3.5 py-2 rounded-lg text-xs italic text-gray-400 bg-white/60 border border-gray-100">
          Pesan dihapus
        </div>
      </div>
    );
  }
  return (
    <div className={`flex ${isOut ? "justify-end" : "justify-start"} group relative`}>
      <div className="max-w-[75%] flex items-start gap-1">
        {isOut && (
          <div className="relative">
            <button onClick={onToggleMenu} className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-gray-400 hover:text-gray-600">
              <MoreVertical className="w-3.5 h-3.5" />
            </button>
            {isOpen && (
              <div className="absolute right-0 top-6 z-20 bg-white rounded-xl shadow-lg border border-gray-100 py-1 w-44 text-xs">
                {m.body && <button onClick={onCopy} className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2"><Copy className="w-3 h-3" /> Salin</button>}
                {m.body && <button onClick={onCopyToInput} className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2"><PencilLine className="w-3 h-3" /> Salin ke kotak balasan</button>}
                <button onClick={() => onDelete("me")} className="w-full text-left px-3 py-2 hover:bg-gray-50 text-gray-700">Hapus untuk Saya</button>
                <button onClick={() => onDelete("everyone")} className="w-full text-left px-3 py-2 hover:bg-red-50 text-red-600">Hapus untuk Semua Orang</button>
              </div>
            )}
          </div>
        )}
        <div className={`px-3 py-1.5 rounded-lg text-[13px] leading-relaxed shadow-sm ${isOut ? "bg-[#d9fdd3] rounded-tr-sm text-gray-800" : "bg-white rounded-tl-sm text-gray-800 border border-gray-100"}`}>
          {m.media_url && <img src={m.media_url} className="rounded-md max-w-full mb-1 max-h-64 object-cover" />}
          {m.body && <span className="whitespace-pre-wrap break-words">{m.body}</span>}
          <div className="flex items-center justify-end gap-1 mt-0.5">
            {isOut && <MessageTicks status={m.delivery_status} />}
          </div>
        </div>
        {!isOut && (
          <div className="relative">
            <button onClick={onToggleMenu} className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-gray-400 hover:text-gray-600">
              <MoreVertical className="w-3.5 h-3.5" />
            </button>
            {isOpen && (
              <div className="absolute left-0 top-6 z-20 bg-white rounded-xl shadow-lg border border-gray-100 py-1 w-40 text-xs">
                {m.body && <button onClick={onCopy} className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2"><Copy className="w-3 h-3" /> Salin</button>}
                <button onClick={() => onDelete("me")} className="w-full text-left px-3 py-2 hover:bg-gray-50 text-gray-700">Hapus untuk Saya</button>
              </div>
            )}
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
  const [messagesError, setMessagesError] = useState("");
  const [openMenuFor, setOpenMenuFor] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    setSelected(conv); setMessages([]); setMessagesError(""); setOpenMenuFor(null);
    try {
      const res = await fetch(`/api/leads-chat/conversations/${conv.id}/messages`);
      const data = await res.json();
      if (data.success) setMessages(data.messages);
      else setMessagesError(data.message ?? `Gagal memuat pesan (status ${res.status})`);
    } catch { setMessagesError("Terjadi kesalahan jaringan saat memuat pesan"); }
    fetchConversations();
  };

  const handlePickImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const sendReply = async () => {
    if (!selected || (!replyText.trim() && !imageFile)) return;
    setSending(true);
    try {
      let mediaUrl: string | undefined;
      if (imageFile) {
        setUploading(true);
        const fd = new FormData();
        fd.append("file", imageFile);
        const upRes = await fetch("/api/leads-chat/upload", { method: "POST", body: fd });
        const upData = await upRes.json();
        setUploading(false);
        if (!upData.success) { setMessagesError(upData.message ?? "Gagal upload gambar"); setSending(false); return; }
        mediaUrl = upData.url;
      }

      const res = await fetch(`/api/leads-chat/conversations/${selected.id}/messages`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: replyText || undefined, mediaUrl }),
      });
      const data = await res.json();
      if (data.success) {
        setReplyText(""); setImageFile(null); setImagePreview(null);
        openConversation(selected);
      } else {
        setMessagesError(data.message ?? "Gagal mengirim pesan");
      }
    } finally { setSending(false); }
  };

  const copyMessage = (text: string | null) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setOpenMenuFor(null);
  };

  const copyToInput = (text: string | null) => {
    if (!text) return;
    setReplyText(text);
    setOpenMenuFor(null);
  };

  const deleteMessage = async (messageId: string, scope: "me" | "everyone") => {
    setOpenMenuFor(null);
    try {
      const res = await fetch(`/api/leads-chat/conversations/${selected?.id}/messages/${messageId}`, {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope }),
      });
      const data = await res.json();
      if (data.success && selected) openConversation(selected);
      else setMessagesError(data.message ?? "Gagal menghapus pesan");
    } catch { setMessagesError("Terjadi kesalahan saat menghapus pesan"); }
  };

  const displayName = (c: Conversation) => c.customer_name || c.customer_identifier;

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
                          {displayName(c).slice(0, 2).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-bold text-gray-800 truncate">{displayName(c)}</p>
                            {c.unread_count > 0 && (
                              <span className="w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-black flex items-center justify-center flex-shrink-0">{c.unread_count}</span>
                            )}
                          </div>
                          <p className="text-[10.5px] text-gray-400 truncate">{c.last_message_preview || "-"}</p>
                          {c.whatsapp_accounts && (
                            <span className="inline-block mt-0.5 text-[9px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-full">
                              via {c.whatsapp_accounts.label}
                            </span>
                          )}
                        </div>
                      </button>
                    ))}
              </div>
            </div>

            <div className="hidden sm:flex flex-1 flex-col" style={{ background: "#efeae2" }}>
              {!selected ? (
                <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Pilih percakapan di sebelah kiri</div>
              ) : (
                <>
                  <div className="px-4 py-3 border-b border-gray-200 bg-white flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-gray-800">{displayName(selected)}</p>
                      <p className="text-[10.5px] text-gray-400">{selected.customer_identifier}</p>
                    </div>
                    {selected.whatsapp_accounts && (
                      <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-full flex items-center gap-1">
                        <MessageCircle className="w-2.5 h-2.5" /> {selected.whatsapp_accounts.label} · {selected.whatsapp_accounts.phone_number}
                      </span>
                    )}
                  </div>
                  {messagesError && (
                    <p className="text-xs text-red-600 font-semibold px-4 py-2 bg-red-50 border-b border-red-100">{messagesError}</p>
                  )}
                  <div className="flex-1 overflow-y-auto p-4 space-y-1.5" onClick={() => openMenuFor && setOpenMenuFor(null)}>
                    {messages.map((m) => (
                      <MessageBubble
                        key={m.id} m={m}
                        isOpen={openMenuFor === m.id}
                        onToggleMenu={() => setOpenMenuFor(openMenuFor === m.id ? null : m.id)}
                        onCopy={() => copyMessage(m.body)}
                        onCopyToInput={() => copyToInput(m.body)}
                        onDelete={(scope) => deleteMessage(m.id, scope)}
                      />
                    ))}
                  </div>
                  <div className="p-3 border-t border-gray-200 bg-white">
                    {imagePreview && (
                      <div className="mb-2 relative inline-block">
                        <img src={imagePreview} className="h-16 rounded-lg border" />
                        <button onClick={() => { setImageFile(null); setImagePreview(null); }}
                          className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                    <div className="flex gap-2 items-center">
                      <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePickImage} className="hidden" />
                      <button onClick={() => fileInputRef.current?.click()}
                        className="w-10 h-10 rounded-xl bg-gray-100 text-gray-500 flex items-center justify-center flex-shrink-0">
                        <Paperclip className="w-4 h-4" />
                      </button>
                      <input value={replyText} onChange={(e) => setReplyText(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && sendReply()} placeholder="Ketik balasan..."
                        className="flex-1 h-10 rounded-xl border border-gray-200 px-3.5 text-xs" />
                      <button onClick={sendReply} disabled={sending || uploading}
                        className="w-10 h-10 rounded-xl bg-[#1a1a2e] text-white flex items-center justify-center disabled:opacity-50 flex-shrink-0">
                        <Send className="w-4 h-4" />
                      </button>
                    </div>
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