  // src/components/layout/OnlineUsersPanel.tsx
  "use client";

  import { useEffect, useState, useCallback, useRef } from "react";
  import { getCurrentUserClient } from "@/lib/auth-client";
  import { getSupabaseClient } from "@/services/supabaseClient";
  import { useChatContext } from "@/contexts/ChatContext";

  const ONLINE_THRESHOLD_MS = 2 * 60 * 1000;
  const FULL_ACCESS_ROLES = ["ADMIN", "PROGRAMMER", "ASISTEN_CEO"];
  const KEPALA_ROLES = [
    "KEPALA_SALES", "KEPALA_MARKETING", "KEPALA_TEKNISI",
    "KEPALA_ONPOINT", "KEPALA_PENYEDIA_BARANG", "KEPALA_SOTECH",
  ];

  type PresenceRecord = {
    user_id: string;
    user_name: string;
    user_role: string;
    current_page: string | null;
    last_seen: string | null;
    is_online: boolean;
    seconds_ago: number | null;
  };

  interface ChatUser {
    id: string;
    name: string;
    role: string;
  }

  function getPageLabel(page: string | null): { label: string; emoji: string } {
    if (!page) return { label: "Belum aktif", emoji: "💤" };
    if (page === "/" || page === "") return { label: "Beranda", emoji: "🏠" };
    if (page.startsWith("/dashboard/attendance/overtime")) return { label: "Lembur", emoji: "⏱️" };
    if (page.startsWith("/dashboard/attendance")) return { label: "Absensi", emoji: "📋" };
    if (page.startsWith("/dashboard/laptops/create")) return { label: "Tambah Laptop", emoji: "➕" };
    if (page.startsWith("/dashboard/laptops/ready")) return { label: "Laptop Siap", emoji: "✅" };
    if (page.startsWith("/dashboard/laptops/minus")) return { label: "Laptop Minus", emoji: "⚠️" };
    if (page.startsWith("/dashboard/laptops")) return { label: "Laptop", emoji: "💻" };
    if (page.startsWith("/dashboard/transactions")) return { label: "Transaksi", emoji: "🛒" };
    if (page.startsWith("/dashboard/users")) return { label: "Manajemen User", emoji: "👥" };
    if (page.startsWith("/dashboard/reports")) return { label: "Laporan", emoji: "📊" };
    if (page.startsWith("/dashboard/warranty")) return { label: "Garansi", emoji: "🛡️" };
    if (page.startsWith("/dashboard/pending-orders")) return { label: "Pending Order", emoji: "⏳" };
    if (page.startsWith("/dashboard/login-logs")) return { label: "Login Log", emoji: "🔐" };
    if (page.startsWith("/dashboard/activity-log")) return { label: "Activity Log", emoji: "📝" };
    if (page.startsWith("/dashboard")) return { label: "Dashboard", emoji: "🏠" };
    if (page.startsWith("/payment/create")) return { label: "Buat Transaksi", emoji: "💳" };
    if (page.startsWith("/payment")) return { label: "Pembayaran", emoji: "💳" };
    if (page.startsWith("/face-verify")) return { label: "Absen Wajah", emoji: "📷" };
    if (page.startsWith("/scan")) return { label: "Scan Barcode", emoji: "📱" };
    return { label: page.replace(/^\//, ""), emoji: "📄" };
  }

  function formatLastSeen(secondsAgo: number | null): string {
    if (secondsAgo === null) return "Belum pernah";
    if (secondsAgo < 60) return "baru saja";
    if (secondsAgo < 3600) return `${Math.floor(secondsAgo / 60)} mnt lalu`;
    if (secondsAgo < 86400) return `${Math.floor(secondsAgo / 3600)} jam lalu`;
    return `${Math.floor(secondsAgo / 86400)} hari lalu`;
  }

  const ROLE_LABEL: Record<string, string> = {
    ADMIN: "Admin", PROGRAMMER: "Programmer", ASISTEN_CEO: "Asisten CEO",
    KEPALA_SALES: "Kepala Sales", CREW_SALES: "Crew Sales",
    KEPALA_MARKETING: "Kepala Marketing", MARKETING: "Marketing",
    KEPALA_TEKNISI: "Kepala Teknisi", TEKNISI: "Teknisi",
    SOTECH: "Sotech", ACCOUNTING: "Accounting", PENGELOLA_BARANG: "Pengelola Barang",
    PENGANTARAN: "Pengantaran", KEBERSIHAN: "Kebersihan",
    PENYEDIA_BARANG: "Penyedia Barang", KEPALA_PENYEDIA_BARANG: "Kepala Penyedia",
    KONTEN: "Konten", KEPALA_ONPOINT: "Kepala Onpoint", ONPOINT: "Onpoint",
    KEPALA_SOTECH: "Kepala Sotech", PKL: "PKL", CUSTOMER_SERVICE: "Customer Service",
  };

  function initials(name: string): string {
    return name.split(" ").slice(0, 2).map(w => w[0] ?? "").join("").toUpperCase();
  }

  function ChatHintTooltip() {
    return (
      <span className="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap bg-gray-800 text-white text-[9px] px-2 py-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow-lg">
        💬 Klik untuk chat
      </span>
    );
  }

  // ── Panel simpel ──────────────────────────────────────────────────────────────
  function OnlineUsersPanelSimple({
    presence, loading, onlineCount, currentUserId, onChatOpen,
  }: {
    presence: PresenceRecord[];
    loading: boolean;
    onlineCount: number;
    currentUserId: string;
    onChatOpen: (user: ChatUser) => void;
  }) {
    const onlineUsers = presence.filter(p => p.is_online);

    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse flex-shrink-0" />
            <p className="text-sm font-bold text-gray-800">Sedang Online</p>
            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
              {onlineCount} orang
            </span>
          </div>
        </div>

        {loading ? (
          <div className="px-4 py-3 space-y-2">
            {Array(3).fill(0).map((_, i) => (
              <div key={i} className="flex items-center gap-2 animate-pulse">
                <div className="w-7 h-7 rounded-xl bg-gray-200 flex-shrink-0" />
                <div className="h-2.5 bg-gray-200 rounded w-28" />
              </div>
            ))}
          </div>
        ) : onlineUsers.length === 0 ? (
          <div className="py-6 text-center">
            <div className="text-2xl mb-1">😴</div>
            <p className="text-xs text-gray-400">Belum ada yang online</p>
          </div>
        ) : (
          <div className="px-4 py-3 flex flex-wrap gap-2 max-h-48 overflow-y-auto">
            {onlineUsers.map(p => {
              const isSelf = p.user_id === currentUserId;
              return (
                <div
                  key={p.user_id}
                  className={`relative group flex items-center gap-1.5 bg-emerald-50 border border-emerald-100 rounded-xl px-2.5 py-1.5 transition-all ${isSelf
                      ? "cursor-default"
                      : "cursor-pointer hover:bg-emerald-100 hover:border-emerald-300 hover:shadow-sm active:scale-95"
                    }`}
                  title={isSelf ? `${p.user_name} (Kamu)` : `${p.user_name} — ${ROLE_LABEL[p.user_role] ?? p.user_role}`}
                  onClick={() => { if (!isSelf) onChatOpen({ id: p.user_id, name: p.user_name, role: p.user_role }); }}
                >
                  {!isSelf && <ChatHintTooltip />}
                  <div className="relative flex-shrink-0">
                    <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-[#1a1a2e] to-[#16213e] flex items-center justify-center text-white text-[8px] font-black">
                      {initials(p.user_name)}
                    </div>
                    <div className="absolute -bottom-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-emerald-500 border border-white animate-pulse" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold text-gray-800 truncate max-w-[80px]">
                      {p.user_name.split(" ")[0]}
                      {isSelf && <span className="text-gray-400 font-normal"> (Kamu)</span>}
                    </p>
                    <p className="text-[9px] text-gray-400 truncate">{ROLE_LABEL[p.user_role] ?? p.user_role}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!loading && (
          <div className="px-4 py-2 bg-gray-50 border-t border-gray-100">
            <p className="text-[9px] text-gray-400">Online = aktif dalam 2 menit terakhir · Klik nama untuk chat</p>
          </div>
        )}
      </div>
    );
  }

  // ── Panel lengkap ─────────────────────────────────────────────────────────────
  function OnlineUsersPanelFull({
    presence, loading, onlineCount, offlineCount, lastUpdate, fetchPresence, currentUserId, onChatOpen,
  }: {
    presence: PresenceRecord[];
    loading: boolean;
    onlineCount: number;
    offlineCount: number;
    lastUpdate: Date;
    fetchPresence: () => void;
    currentUserId: string;
    onChatOpen: (user: ChatUser) => void;
  }) {
    const [filter, setFilter] = useState<"all" | "online" | "offline">("all");

    const filtered = presence
      .filter(p => filter === "all" ? true : filter === "online" ? p.is_online : !p.is_online)
      .sort((a, b) => {
        if (a.is_online && !b.is_online) return -1;
        if (!a.is_online && b.is_online) return 1;
        if (!a.last_seen && !b.last_seen) return a.user_name.localeCompare(b.user_name);
        if (!a.last_seen) return 1;
        if (!b.last_seen) return -1;
        return new Date(b.last_seen).getTime() - new Date(a.last_seen).getTime();
      });

    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3.5 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse flex-shrink-0" />
              <p className="text-sm font-bold text-gray-800">Status Karyawan</p>
              <span className="text-[10px] text-gray-400">
                {lastUpdate.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />{onlineCount}
              </span>
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full bg-gray-100 text-gray-500 border border-gray-200">
                <div className="w-1.5 h-1.5 rounded-full bg-gray-400" />{offlineCount}
              </span>
              <button onClick={fetchPresence}
                className="w-6 h-6 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all"
                title="Refresh">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            </div>
          </div>
          <div className="flex gap-0.5 mt-2.5 bg-gray-100 rounded-lg p-0.5 w-full">
            {(["all", "online", "offline"] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`flex-1 py-1 rounded-md text-[10px] font-bold transition-all ${filter === f ? "bg-white text-gray-800 shadow-sm" : "text-gray-400 hover:text-gray-600"
                  }`}>
                {f === "all" ? `Semua (${presence.length})` : f === "online" ? `🟢 ${onlineCount}` : `⚫ ${offlineCount}`}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="divide-y divide-gray-100">
            {Array(4).fill(0).map((_, i) => (
              <div key={i} className="px-4 py-2.5 flex items-center gap-2.5 animate-pulse">
                <div className="w-8 h-8 rounded-xl bg-gray-200 flex-shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-2.5 bg-gray-200 rounded w-24" />
                  <div className="h-2 bg-gray-100 rounded w-32" />
                </div>
                <div className="w-12 h-4 bg-gray-100 rounded" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-8 text-center">
            <div className="text-2xl mb-1.5">👻</div>
            <p className="text-xs text-gray-400 font-medium">
              {filter === "online" ? "Tidak ada yang online" : "Tidak ada data"}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 overflow-y-auto max-h-80">
            {filtered.map(p => {
              const pageInfo = getPageLabel(p.current_page);
              const isSelf = p.user_id === currentUserId;
              return (
                <div
                  key={p.user_id}
                  className={`relative group px-4 py-2.5 flex items-center gap-2.5 transition-colors ${p.is_online ? "" : "opacity-55"} ${isSelf ? "cursor-default" : "cursor-pointer hover:bg-emerald-50/60 active:bg-emerald-100/60"
                    }`}
                  onClick={() => { if (!isSelf) onChatOpen({ id: p.user_id, name: p.user_name, role: p.user_role }); }}
                  title={isSelf ? `${p.user_name} (Kamu)` : `💬 Chat dengan ${p.user_name}`}
                >
                  <div className="relative flex-shrink-0">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-white text-[9px] font-black shadow-sm ${p.is_online ? "bg-gradient-to-br from-[#1a1a2e] to-[#16213e]" : "bg-gray-400"
                      }`}>
                      {initials(p.user_name)}
                    </div>
                    <div className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-white ${p.is_online ? "bg-emerald-500 animate-pulse" : "bg-gray-300"
                      }`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <p className="text-xs font-bold text-gray-800 truncate leading-tight">{p.user_name}</p>
                      {isSelf && <span className="text-[8px] text-gray-400 font-normal flex-shrink-0">(Kamu)</span>}
                    </div>
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className="text-xs leading-none">{pageInfo.emoji}</span>
                      <p className="text-[10px] text-gray-400 truncate">{pageInfo.label}</p>
                    </div>
                  </div>
                  <div className="flex-shrink-0 flex items-center gap-1.5">
                    {!isSelf && (
                      <svg className="w-3.5 h-3.5 text-gray-300 group-hover:text-emerald-500 transition-colors flex-shrink-0"
                        fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                    )}
                    {p.is_online ? (
                      <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
                        <div className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />Online
                      </span>
                    ) : (
                      <span className="text-[10px] text-gray-400">{formatLastSeen(p.seconds_ago)}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!loading && presence.length > 0 && (
          <div className="px-4 py-2 bg-gray-50 border-t border-gray-100">
            <p className="text-[9px] text-gray-400">Online = aktif dalam 2 menit terakhir · Klik nama untuk chat 💬</p>
          </div>
        )}
      </div>
    );
  }

  // ── Main export ───────────────────────────────────────────────────────────────
  export function OnlineUsersPanel() {
    const [currentUser, setCurrentUser] = useState<{ id: string; name: string; role: string } | null>(null);
    const [roleLoading, setRoleLoading] = useState(true);
    const [presence, setPresence] = useState<PresenceRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

    // ← Ambil openChat dari ChatContext di app/dashboard/layout.tsx
    const { openChat } = useChatContext();

    const supabaseRef = useRef(getSupabaseClient());
    const channelRef = useRef<ReturnType<typeof supabaseRef.current.channel> | null>(null);

    useEffect(() => {
      getCurrentUserClient().then(user => {
        if (user) setCurrentUser({ id: user.id, name: user.name, role: user.role });
        setRoleLoading(false);
      });
    }, []);

    const isAdmin = !!currentUser?.role && FULL_ACCESS_ROLES.includes(currentUser.role);
    const isKepala = !!currentUser?.role && KEPALA_ROLES.includes(currentUser.role);
    const isAllowed = !roleLoading && !!currentUser;

    const recalculate = useCallback((records: PresenceRecord[]): PresenceRecord[] => {
      const now = Date.now();
      return records.map(p => ({
        ...p,
        is_online: p.last_seen ? now - new Date(p.last_seen).getTime() < ONLINE_THRESHOLD_MS : false,
        seconds_ago: p.last_seen ? Math.floor((now - new Date(p.last_seen).getTime()) / 1000) : null,
      }));
    }, []);

    const fetchPresence = useCallback(async () => {
      try {
        const res = await fetch("/api/presence");
        const data = await res.json();
        if (data.success) {
          setPresence(recalculate(data.data || []));
          setLastUpdate(new Date());
        }
      } catch (err) {
        console.error("[OnlineUsersPanel] fetch error:", err);
      } finally {
        setLoading(false);
      }
    }, [recalculate]);

    useEffect(() => {
      if (!isAllowed) return;
      fetchPresence();

      if (channelRef.current) {
        supabaseRef.current.removeChannel(channelRef.current);
        channelRef.current = null;
      }

      const channel = supabaseRef.current
        .channel(`user_presence_${Date.now()}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "user_presence" }, (payload) => {
          const now = Date.now();
          if (payload.eventType === "DELETE") {
            const deletedId = (payload.old as any).user_id;
            setPresence(prev => prev.map(p => p.user_id === deletedId ? { ...p, is_online: false, current_page: null } : p));
            return;
          }
          const updated = payload.new as any;
          setPresence(prev => prev.map(p => {
            if (p.user_id !== updated.user_id) return p;
            return {
              ...p,
              current_page: updated.current_page,
              last_seen: updated.last_seen,
              is_online: now - new Date(updated.last_seen).getTime() < ONLINE_THRESHOLD_MS,
              seconds_ago: Math.floor((now - new Date(updated.last_seen).getTime()) / 1000),
            };
          }));
          setLastUpdate(new Date());
        })
        .subscribe();

      channelRef.current = channel;
      const ticker = setInterval(() => setPresence(prev => recalculate(prev)), 10_000);

      return () => {
        clearInterval(ticker);
        if (channelRef.current) {
          supabaseRef.current.removeChannel(channelRef.current);
          channelRef.current = null;
        }
      };
    }, [isAllowed]);

    if (roleLoading || !isAllowed || !currentUser) return null;

    const onlineCount = presence.filter(p => p.is_online).length;
    const offlineCount = presence.filter(p => !p.is_online).length;

    if (isAdmin || isKepala) {
      return (
        <OnlineUsersPanelFull
          presence={presence}
          loading={loading}
          onlineCount={onlineCount}
          offlineCount={offlineCount}
          lastUpdate={lastUpdate}
          fetchPresence={fetchPresence}
          currentUserId={currentUser.id}
          onChatOpen={openChat}
        />
      );
    }

    return (
      <OnlineUsersPanelSimple
        presence={presence}
        loading={loading}
        onlineCount={onlineCount}
        currentUserId={currentUser.id}
        onChatOpen={openChat}
      />
    );
  }