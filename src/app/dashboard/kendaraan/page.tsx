"use client";

import { useEffect, useState, useCallback } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import {
  Car, Bike, Plus, Pencil, Trash2, Inbox, LogOut, CheckCircle2,
  Loader2, Fuel, User, Wrench, RefreshCw, Send, AlertTriangle,
} from "lucide-react";
import {
  inp, lbl, primaryBtn, secondaryBtn, ErrorBanner, Spinner, EmptyState,
  ModalWrapper, ModalHead, ModalFoot, VehicleStatusBadge, ApprovedByNote, StatPill,
  formatTime, formatDateTime,
} from "@/components/kendaraan/ui";
import { ApproveRequestModal, RejectRequestModal } from "@/components/kendaraan/ApprovalModals";
import VehicleSopGate from "@/components/kendaraan/VehicleSopGate";

type LastUsage = {
  borrower_name: string;
  status: string;
  fuel: string | null;
  condition: string | null;
  at: string | null;
  approver_name?: string | null; // nama admin yang meng-ACC
};
type Vehicle = {
  id: string;
  name: string;
  type: "MOTOR" | "MOBIL";
  status: "TERSEDIA" | "DIPAKAI" | "MAINTENANCE";
  battery_level: string | null;
  fuel_level: string | null;
  lastUsage?: LastUsage | null;
};
type UserLite = { id: string; name: string; role: string };
type BorrowRequest = {
  id: string;
  vehicle_id: string;
  user_id: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "COMPLETED";
  requested_at: string;
  approved_at: string | null;
  rejection_note: string | null;
  actual_start: string | null;
  vehicle?: Vehicle | null;
  borrower?: UserLite | null;
  approver?: UserLite | null;
};

export default function KendaraanPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [myRequests, setMyRequests] = useState<BorrowRequest[]>([]);
    const [isAdmin, setIsAdmin] = useState(false);
  const [canApprove, setCanApprove] = useState(false);
  const [queue, setQueue] = useState<BorrowRequest[]>([]);

  const [borrowTarget, setBorrowTarget] = useState<Vehicle | null>(null);
  const [checkoutTarget, setCheckoutTarget] = useState<BorrowRequest | null>(null);
  const [approveTarget, setApproveTarget] = useState<BorrowRequest | null>(null);
  const [rejectTarget, setRejectTarget] = useState<BorrowRequest | null>(null);
  const [editTarget, setEditTarget] = useState<Vehicle | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const reload = useCallback(async () => {
    setError("");
    try {
      const res = await fetch("/api/vehicles", { cache: "no-store" });
      const d = await res.json();
      if (!res.ok || !d.success) throw new Error(d.message || `Error ${res.status}`);
           setVehicles(d.vehicles);
      setMyRequests(d.myRequests);
      setIsAdmin(d.isAdmin);
      setCanApprove(d.canApprove);
      if (d.canApprove) {
        const qr = await fetch("/api/vehicles/borrow?queue=1", { cache: "no-store" });
        const qd = await qr.json();
        if (qr.ok && qd.success) setQueue(qd.requests);
      }
    } catch (e: any) {
      setError(e.message || "Gagal memuat data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const myActiveFor = (vehicleId: string) =>
    myRequests.find((r) => r.vehicle_id === vehicleId && (r.status === "PENDING" || r.status === "APPROVED"));

 const motors = vehicles.filter((v) => v.type === "MOTOR");
  const mobils = vehicles.filter((v) => v.type === "MOBIL");
  const availableCount = vehicles.filter((v) => v.status === "TERSEDIA").length;
  const inUseCount = vehicles.filter((v) => v.status === "DIPAKAI").length;
  const maintenanceCount = vehicles.filter((v) => v.status === "MAINTENANCE").length;

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-[#F7F7F8]">
        {/* Hero */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-zinc-900 via-zinc-800 to-black px-5 py-5 sm:px-7 sm:py-6 lg:px-9 lg:py-7 shadow-lg shadow-black/20 mb-5">
          <div className="pointer-events-none absolute -top-24 -right-24 w-64 h-64 rounded-full bg-white/5 blur-3xl" />
          <div className="relative flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-lg sm:text-2xl lg:text-3xl font-black text-white leading-tight">Manajemen Kendaraan</h1>
              <p className="text-[11px] sm:text-xs lg:text-sm text-zinc-400 mt-1">
                Pinjam kendaraan operasional & pantau pemakaian
              </p>
              <div className="flex flex-wrap items-center gap-1.5 mt-3">
                <StatPill label="Tersedia" count={availableCount} tone="emerald" />
                <StatPill label="Dipakai" count={inUseCount} tone="zinc" />
                <StatPill label="Maintenance" count={maintenanceCount} tone="amber" />
              </div>
            </div>
            {isAdmin && (
              <button
                onClick={() => setAddOpen(true)}
                className="h-10 px-3 sm:px-4 bg-white hover:bg-zinc-100 text-zinc-900 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all active:scale-95 shadow-sm shadow-black/30 shrink-0"
              >
                <Plus size={15} /> <span className="hidden sm:inline">Tambah Kendaraan</span>
              </button>
            )}
          </div>
        </div>

        <VehicleSopGate />

        {error && (
          <div className="mb-4">
            <ErrorBanner msg={error} />
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-24 text-gray-400 gap-2 text-sm">
            <Loader2 className="animate-spin" size={18} /> Memuat…
          </div>
        ) : (
          <div className="space-y-6">
            {/* Antrian ACC (Admin) */}
            {canApprove && queue.length > 0 && (
              <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-5">
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-8 h-8 rounded-xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center">
                    <Inbox size={16} />
                  </span>
                  <h2 className="text-sm sm:text-base font-black text-gray-900">Menunggu ACC ({queue.length})</h2>
                </div>
               <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {queue.map((r) => (
                    <div key={r.id} className="border border-gray-100 hover:border-gray-200 rounded-xl p-3.5 bg-gray-50/50 transition-colors">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-gray-900 truncate">{r.vehicle?.name ?? "—"}</p>
                          <p className="text-[10px] text-gray-500 truncate">
                            {r.borrower?.name ?? "—"} · {r.borrower?.role?.replace(/_/g, " ")}
                          </p>
                        </div>
                        <span className="text-[9px] text-gray-400 whitespace-nowrap">{formatDateTime(r.requested_at)}</span>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => setApproveTarget(r)} className={primaryBtn}>
                          <CheckCircle2 size={14} /> Setujui
                        </button>
                        <button
                          onClick={() => setRejectTarget(r)}
                          className="flex-1 h-10 bg-white border border-red-200 text-red-600 rounded-xl text-xs font-semibold hover:bg-red-50 transition-all active:scale-[0.98]"
                        >
                          Tolak
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Daftar kendaraan */}
            <VehicleSection
              title="Motor"
              icon={<Bike size={16} />}
              vehicles={motors}
              isAdmin={isAdmin}
              myActiveFor={myActiveFor}
              onBorrow={setBorrowTarget}
              onCheckout={setCheckoutTarget}
              onEdit={setEditTarget}
              onReload={reload}
            />
            <VehicleSection
              title="Mobil"
              icon={<Car size={16} />}
              vehicles={mobils}
              isAdmin={isAdmin}
              myActiveFor={myActiveFor}
              onBorrow={setBorrowTarget}
              onCheckout={setCheckoutTarget}
              onEdit={setEditTarget}
              onReload={reload}
            />

            {/* Pengajuan saya yang sudah diproses (rejected) */}
            <MyRejectedNotices requests={myRequests} />
          </div>
        )}
      </div>

      {borrowTarget && <BorrowModal vehicle={borrowTarget} onClose={() => setBorrowTarget(null)} onSaved={reload} />}
      {checkoutTarget && <CheckoutModal request={checkoutTarget} onClose={() => setCheckoutTarget(null)} onSaved={reload} />}
      {approveTarget && <ApproveRequestModal request={approveTarget} onClose={() => setApproveTarget(null)} onSaved={reload} />}
      {rejectTarget && <RejectRequestModal request={rejectTarget} onClose={() => setRejectTarget(null)} onSaved={reload} />}
      {addOpen && <VehicleFormModal onClose={() => setAddOpen(false)} onSaved={reload} />}
      {editTarget && <VehicleFormModal vehicle={editTarget} onClose={() => setEditTarget(null)} onSaved={reload} />}
    </DashboardLayout>
  );
}

// ─── SECTION ─────────────────────────────────────────────────────────────────
function VehicleSection({
  title, icon, vehicles, isAdmin, myActiveFor, onBorrow, onCheckout, onEdit, onReload,
}: {
  title: string;
  icon: React.ReactNode;
  vehicles: Vehicle[];
  isAdmin: boolean;
  myActiveFor: (id: string) => BorrowRequest | undefined;
  onBorrow: (v: Vehicle) => void;
  onCheckout: (r: BorrowRequest) => void;
  onEdit: (v: Vehicle) => void;
  onReload: () => void;
}) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <span className="w-8 h-8 rounded-xl bg-zinc-100 border border-zinc-200 text-zinc-700 flex items-center justify-center">
          {icon}
        </span>
         <h2 className="text-sm sm:text-base font-black text-gray-900">
          {title} <span className="text-gray-400 font-bold">({vehicles.length})</span>
        </h2>
      </div>
      {vehicles.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
          <EmptyState icon={icon} text={`Belum ada ${title.toLowerCase()} terdaftar.`} />
        </div>
      ) : (
        <div className="grid gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {vehicles.map((v) => (
            <VehicleCard
              key={v.id}
              vehicle={v}
              isAdmin={isAdmin}
              myActive={myActiveFor(v.id)}
              onBorrow={() => onBorrow(v)}
              onCheckout={onCheckout}
              onEdit={() => onEdit(v)}
              onReload={onReload}
            />
          ))}
        </div>
      )}
    </section>
  );
}

// ─── CARD ────────────────────────────────────────────────────────────────────
function VehicleCard({
  vehicle: v, isAdmin, myActive, onBorrow, onCheckout, onEdit, onReload,
}: {
  vehicle: Vehicle;
  isAdmin: boolean;
  myActive?: BorrowRequest;
  onBorrow: () => void;
  onCheckout: (r: BorrowRequest) => void;
  onEdit: () => void;
  onReload: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);

  const del = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/vehicles/${v.id}`, { method: "DELETE" });
      const d = await res.json();
      if (!res.ok || !d.success) throw new Error(d.message);
      onReload();
    } catch (e: any) {
      alert(e.message || "Gagal menghapus");
    } finally {
      setDeleting(false);
    }
  };

  const restore = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/vehicles/${v.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "TERSEDIA" }),
      });
      const d = await res.json();
      if (!res.ok || !d.success) throw new Error(d.message);
      onReload();
    } catch (e: any) {
      alert(e.message || "Gagal");
    } finally {
      setBusy(false);
    }
  };

  const iAmUsing = myActive?.status === "APPROVED" && v.status === "DIPAKAI";
  const iAmPending = myActive?.status === "PENDING";

  // Icon jenis kendaraan + warna aksen tipis di atas kartu sesuai status
  const TypeIcon = v.type === "MOTOR" ? Bike : Car;
  const accent: Record<string, string> = {
    TERSEDIA: "bg-emerald-400",
    DIPAKAI: "bg-zinc-400",
    MAINTENANCE: "bg-amber-400",
  };

  return (
    <div className="group relative bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-lg hover:-translate-y-0.5 hover:border-gray-200 transition-all duration-200 overflow-hidden flex flex-col">
    <div className={`h-1 w-full ${accent[v.status] ?? "bg-gray-200"}`} />
      <div className="p-4 sm:p-5 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2.5 min-w-0">
            <span className="w-10 h-10 rounded-xl bg-zinc-100 border border-zinc-200 text-zinc-400 flex items-center justify-center shrink-0">
              <TypeIcon size={18} />
            </span>
            <div className="min-w-0 pt-0.5">
              <p className="text-sm font-black text-gray-900 truncate">{v.name}</p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1">
                <span className="text-[10px] text-gray-500 flex items-center gap-1">
                  <Fuel size={12} className="text-emerald-500" /> {v.fuel_level || "—"}
                </span>
                {v.lastUsage && (
                  <span className="text-[10px] text-gray-500 flex items-center gap-1 truncate max-w-[180px] sm:max-w-[200px]">
                    <User size={12} className="text-gray-400 shrink-0" />
                    {v.status === "DIPAKAI" && v.lastUsage.status === "APPROVED"
                      ? v.lastUsage.borrower_name
                      : `Terakhir: ${v.lastUsage.borrower_name}`}
                  </span>
                )}
                {v.status === "DIPAKAI" && v.lastUsage?.approver_name && (
                  <span className="text-[10px] text-gray-400 flex items-center gap-1 truncate max-w-[180px] sm:max-w-[200px]">
                    <CheckCircle2 size={12} className="text-emerald-400 shrink-0" />
                    ACC: {v.lastUsage.approver_name}
                  </span>
                )}
              </div>
            </div>
          </div>
          <VehicleStatusBadge status={v.status} />
        </div>

        {/* Aksi peminjam */}
        {v.status === "TERSEDIA" && !iAmPending && (
          <button onClick={onBorrow} className={primaryBtn}>
            <Plus size={14} /> Ajukan Pinjam
          </button>
        )}
        {iAmPending && (
          <div className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 font-semibold">
            Pengajuanmu menunggu ACC admin…
          </div>
        )}
        {iAmUsing && (
          <>
            <ApprovedByNote name={myActive?.approver?.name} />
            <button onClick={() => myActive && onCheckout(myActive)} className={primaryBtn}>
              <LogOut size={14} /> Check-out (Selesai Pakai)
            </button>
          </>
        )}
        {v.status === "DIPAKAI" && !iAmUsing && (
          <div className="text-[10px] text-zinc-700 bg-zinc-100 border border-zinc-200 rounded-xl px-3 py-2 font-semibold">
            Sedang dipakai karyawan lain
          </div>
        )}
        {v.status === "MAINTENANCE" && (
          <div className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 font-semibold flex items-center gap-1.5">
            <Wrench size={12} /> Dalam perbaikan
          </div>
        )}

        {/* Aksi admin */}
       {isAdmin && (
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-100">
            <button onClick={onEdit} className="flex-1 min-w-[84px] h-9 text-[11px] font-semibold text-gray-600 border border-gray-100 hover:bg-gray-50 hover:border-gray-200 rounded-lg flex items-center justify-center gap-1 transition">
              <Pencil size={12} /> Edit
            </button>
            {v.status === "MAINTENANCE" && (
              <button onClick={restore} disabled={busy} className="flex-1 min-w-[110px] h-9 text-[11px] font-semibold text-emerald-600 border border-emerald-100 hover:bg-emerald-50 rounded-lg flex items-center justify-center gap-1 transition disabled:opacity-40">
                {busy ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Set Tersedia
              </button>
            )}
            <button onClick={del} disabled={deleting} className="flex-1 min-w-[84px] h-9 text-[11px] font-semibold text-red-500 border border-red-100 hover:bg-red-50 rounded-lg flex items-center justify-center gap-1 transition disabled:opacity-40">
              {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />} Hapus
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function MyRejectedNotices({ requests }: { requests: BorrowRequest[] }) {
  // Notifikasi penolakan (pengajuan REJECTED 7 hari terakhir), bisa ditutup per sesi.
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const rejected = requests.filter((r) => r.status === "REJECTED" && !dismissed.has(r.id));
  if (rejected.length === 0) return null;
  return (
    <section className="space-y-2">
      {rejected.map((r) => (
        <div key={r.id} className="bg-red-50 border border-red-200 rounded-xl px-3.5 py-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold text-red-700">Pengajuan {r.vehicle?.name ?? "kendaraan"} ditolak</p>
            {r.rejection_note && <p className="text-[11px] text-red-600 mt-0.5">Alasan: {r.rejection_note}</p>}
            {r.approver && <p className="text-[10px] text-red-500/80 mt-0.5">Ditolak oleh: {r.approver.name}</p>}
          </div>
          <button
            onClick={() => setDismissed((prev) => new Set(prev).add(r.id))}
            className="w-6 h-6 rounded-lg text-red-400 hover:bg-red-100 flex items-center justify-center shrink-0 transition"
            aria-label="Tutup"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
    </section>
  );
}

// ─── BORROW (ajukan) ─────────────────────────────────────────────────────────
function BorrowModal({ vehicle, onClose, onSaved }: { vehicle: Vehicle; onClose: () => void; onSaved: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const submit = async () => {
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/vehicles/borrow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vehicle_id: vehicle.id }),
      });
      const d = await res.json();
      if (!res.ok || !d.success) throw new Error(d.message || `Error ${res.status}`);
      onSaved();
      onClose();
    } catch (e: any) {
      setErr(e.message || "Gagal");
    } finally {
      setBusy(false);
    }
  };
  return (
    <ModalWrapper onClose={onClose} preventClose={busy}>
      <ModalHead icon={<Send size={18} />} title="Ajukan Peminjaman" sub={vehicle.name} onClose={onClose} />
      <div className="px-5 py-4 space-y-3">
        {err && <ErrorBanner msg={err} />}
        <p className="text-xs text-gray-600 leading-relaxed">
          Kamu akan mengajukan peminjaman <b>{vehicle.name}</b>. Pengajuan menunggu ACC admin sebelum kendaraan bisa dipakai.
        </p>
      </div>
      <ModalFoot>
        <button onClick={onClose} disabled={busy} className={secondaryBtn}>Batal</button>
        <button onClick={submit} disabled={busy} className={primaryBtn}>
          {busy ? <Spinner /> : "Ajukan"}
        </button>
      </ModalFoot>
    </ModalWrapper>
  );
}

// ─── CHECKOUT (wajib isi lengkap sebelum tombol aktif) ───────────────────────
function CheckoutModal({ request, onClose, onSaved }: { request: BorrowRequest; onClose: () => void; onSaved: () => void }) {
  const [fuel, setFuel] = useState("");
  const [condition, setCondition] = useState<"" | "BAIK" | "LECET" | "RUSAK">("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // Semua field wajib terisi -> baru tombol aktif (pola mustUpload di fitur Lembur)
  const canSubmit = fuel.trim().length > 0 && condition !== "";

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(`/api/vehicles/borrow/${request.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "CHECKOUT", return_fuel_level: fuel.trim(), return_condition: condition }),
      });
      const d = await res.json();
      if (!res.ok || !d.success) throw new Error(d.message || `Error ${res.status}`);
      onSaved();
      onClose();
    } catch (e: any) {
      setErr(e.message || "Gagal");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalWrapper onClose={onClose} preventClose={busy}>
      <ModalHead icon={<LogOut size={18} />} title="Check-out Kendaraan" sub={request.vehicle?.name} onClose={onClose} />
      <div className="px-5 py-4 space-y-3.5">
        {err && <ErrorBanner msg={err} />}
        <div className="bg-gray-50 border border-gray-100 rounded-xl px-3.5 py-2.5 text-[11px] text-gray-600">
          Dipakai sejak <b>{formatTime(request.actual_start)}</b>
        </div>
        <div>
          <label className={lbl}>Level Bensin / Baterai *</label>
          <input
            value={fuel}
            onChange={(e) => setFuel(e.target.value)}
            placeholder="mis. Setengah, 3/4, 80%, 3 bar"
            className={inp}
          />
        </div>
        <div>
          <label className={lbl}>Kondisi Fisik *</label>
          <select value={condition} onChange={(e) => setCondition(e.target.value as any)} className={inp}>
            <option value="">— Pilih kondisi —</option>
            <option value="BAIK">Baik</option>
            <option value="LECET">Lecet</option>
            <option value="RUSAK">Rusak</option>
          </select>
          {condition === "RUSAK" && (
            <p className="text-[10px] text-amber-600 mt-1.5 font-medium flex items-start gap-1">
              <AlertTriangle size={12} className="shrink-0 mt-px" />
              Kendaraan akan otomatis dikunci status Maintenance sampai admin mengembalikannya.
            </p>
          )}
        </div>
      </div>
      <ModalFoot>
        <button onClick={onClose} disabled={busy} className={secondaryBtn}>Batal</button>
        <button onClick={submit} disabled={busy || !canSubmit} className={primaryBtn}>
          {busy ? <Spinner /> : canSubmit ? "Check-out" : "Lengkapi Dulu"}
        </button>
      </ModalFoot>
    </ModalWrapper>
  );
}

// ─── VEHICLE FORM (tambah / edit) — ADMIN ────────────────────────────────────
function VehicleFormModal({ vehicle, onClose, onSaved }: { vehicle?: Vehicle; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!vehicle;
  const [name, setName] = useState(vehicle?.name ?? "");
  const [type, setType] = useState<"MOTOR" | "MOBIL">(vehicle?.type ?? "MOTOR");
  const [fuel, setFuel] = useState(vehicle?.fuel_level ?? "");
  const [status, setStatus] = useState(vehicle?.status ?? "TERSEDIA");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const canSubmit = name.trim().length > 0;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setErr("");
    try {
      const url = isEdit ? `/api/vehicles/${vehicle!.id}` : "/api/vehicles";
      const method = isEdit ? "PUT" : "POST";
      const payload: any = { name: name.trim(), type, fuel_level: fuel.trim() };
      if (isEdit) payload.status = status;
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await res.json();
      if (!res.ok || !d.success) throw new Error(d.message || `Error ${res.status}`);
      onSaved();
      onClose();
    } catch (e: any) {
      setErr(e.message || "Gagal");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalWrapper onClose={onClose} preventClose={busy}>
      <ModalHead icon={<Car size={18} />} title={isEdit ? "Edit Kendaraan" : "Tambah Kendaraan"} onClose={onClose} />
      <div className="px-5 py-4 space-y-3.5">
        {err && <ErrorBanner msg={err} />}
        <div>
          <label className={lbl}>Nama Kendaraan *</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="mis. Beat 2023" className={inp} />
        </div>
        <div>
          <label className={lbl}>Tipe *</label>
          <select value={type} onChange={(e) => setType(e.target.value as any)} className={inp}>
            <option value="MOTOR">Motor</option>
            <option value="MOBIL">Mobil</option>
          </select>
        </div>
        <div>
          <label className={lbl}>{type === "MOBIL" ? "Level Bensin (awal)" : "Level Bensin / Baterai (awal)"}</label>
          <input
            value={fuel}
            onChange={(e) => setFuel(e.target.value)}
            placeholder="mis. Full, 1/2, 80%, 3 bar"
            className={inp}
          />
          <p className="text-[10px] text-gray-400 mt-1.5">
            Otomatis ter-update ke level checkout terakhir tiap kendaraan selesai dipakai.
          </p>
        </div>
        {isEdit && (
          <div>
            <label className={lbl}>Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value as any)} className={inp}>
              <option value="TERSEDIA">Tersedia</option>
              <option value="MAINTENANCE">Maintenance</option>
              <option value="DIPAKAI">Dipakai</option>
            </select>
          </div>
        )}
      </div>
      <ModalFoot>
        <button onClick={onClose} disabled={busy} className={secondaryBtn}>Batal</button>
        <button onClick={submit} disabled={busy || !canSubmit} className={primaryBtn}>
          {busy ? <Spinner /> : isEdit ? "Simpan" : "Tambah"}
        </button>
      </ModalFoot>
    </ModalWrapper>
  );
}