"use client";

// src/components/users/RoleAccessManager.tsx
//
// Tab "Role & Hak Akses" di halaman /dashboard/users.
// Hanya dirender kalau isRoleManager true (dicek di parent: ADMIN/PROGRAMMER/ASISTEN_CEO).
//
// Ada 2 kategori role di sini:
// 1. Role Bawaan (legacy) — daftar UserRole hardcode dari lib/permissions.ts.
//    Tidak bisa dibuat/dihapus di sini, tapi begitu diklik, matrix hak akses
//    OTOMATIS TER-ISI dari ROUTE_PERMISSIONS yang sudah ada di kode, supaya
//    admin langsung lihat kondisi saat ini tanpa setting manual dari nol.
// 2. Role Custom — dibuat lewat tombol "+ Buat Role", disimpan di tabel
//    dynamic_roles, matrix-nya kosong sampai admin isi sendiri.
//    Bisa di-Edit (label/icon/PKL/parent) dan di-Hapus lewat tombol di tiap baris.

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, AlertTriangle, Save, Pencil, Trash2 } from "lucide-react";

interface DynamicRoleRow {
  id: string;
  key: string;
  label: string;
  icon: string;
  badge_bg: string;
  badge_text: string;
  badge_border: string;
  is_pkl: boolean;
  parent_role: string | null;
}

interface LegacyRoleRow {
  key: string;
  label: string;
}

interface AppPageRow {
  key: string;
  label: string;
  route: string;
  group_label: string;
  sort_order: number;
}

interface PermRow {
  page_key: string;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
}

type SelectedRole =
  | { kind: "dynamic"; key: string; label: string; icon: string }
  | { kind: "legacy"; key: string; label: string; icon: string };

const EMPTY_PERM: Omit<PermRow, "page_key"> = {
  can_view: false,
  can_create: false,
  can_edit: false,
  can_delete: false,
};

function Toast({ msg, type, onClose }: { msg: string; type: "ok" | "err"; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 2800);
    return () => clearTimeout(t);
  }, [onClose]);
  return (
    <div
      className={`fixed top-5 right-5 z-[9999] px-4 py-3 rounded-2xl shadow-2xl text-sm font-semibold bg-white border ${type === "ok" ? "text-slate-700 border-slate-100" : "text-red-600 border-red-100"
        } flex items-center gap-2`}
    >
      {type === "ok" ? <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" /> : <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />}
      {msg}
    </div>
  );
}

// ── Modal Buat / Edit Role ────────────────────────────────────────────────────
// Satu komponen dipakai untuk 2 mode:
// - create  → role === null/undefined, POST /api/admin/roles
// - edit    → role terisi,             PUT  /api/admin/roles
function RoleFormModal({
  onClose,
  onSaved,
  existingRoles,
  role,
}: {
  onClose: () => void;
  onSaved: () => void;
  existingRoles: DynamicRoleRow[];
  role?: DynamicRoleRow | null;
}) {
  const isEdit = !!role;
  const [key, setKey] = useState(role?.key ?? "");
  const [label, setLabel] = useState(role?.label ?? "");
  const [icon, setIcon] = useState(role?.icon ?? "");
  const [isPkl, setIsPkl] = useState(role?.is_pkl ?? false);
  const [parentRole, setParentRole] = useState(role?.parent_role ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Role tidak boleh mewarisi akses dari dirinya sendiri (infinite loop resolusi permission)
  const parentOptions = useMemo(
    () => existingRoles.filter((r) => r.key !== role?.key),
    [existingRoles, role?.key]
  );

  const save = async () => {
    setError("");
    if (!isEdit && !key.trim()) {
      setError("Key role wajib diisi");
      return;
    }
    if (!label.trim()) {
      setError("Nama role wajib diisi");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/roles", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isEdit
            ? {
              id: role!.id,
              label: label.trim(),
              icon,
              is_pkl: isPkl,
              parent_role: parentRole || null,
            }
            : {
              key: key.trim(),
              label: label.trim(),
              icon,
              is_pkl: isPkl,
              parent_role: parentRole || null,
            }
        ),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.message);
        return;
      }
      onSaved();
      onClose();
    } catch {
      setError("Terjadi kesalahan");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md p-6">
        <h3 className="font-black text-slate-800 text-base mb-4">
          {isEdit ? "Edit Role Custom" : "Buat Role Baru"}
        </h3>
        {error && (
          <div className="mb-3 px-3 py-2.5 rounded-xl text-xs font-semibold bg-red-50 border border-red-100 text-red-600">
            {error}
          </div>
        )}
        <div className="space-y-3">
          <div>
            <label className="text-[10.5px] font-bold uppercase tracking-widest text-slate-400 block mb-1">
              Key Role (unik, huruf besar)
            </label>
            <input
              value={key}
              disabled={isEdit}
              onChange={(e) => setKey(e.target.value.toUpperCase().replace(/\s+/g, "_"))}
              placeholder="contoh: GUDANG_CABANG_2"
              className="w-full h-10 border rounded-xl px-3 text-sm border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
            />
            {isEdit && (
              <p className="text-[9.5px] text-slate-400 mt-1">
                Key tidak bisa diubah — nilai ini tersimpan di kolom <code>users.role</code> &{" "}
                <code>users.roles[]</code> dan di <code>role_page_permissions</code>.
              </p>
            )}
          </div>
          <div>
            <label className="text-[10.5px] font-bold uppercase tracking-widest text-slate-400 block mb-1">
              Nama Tampil
            </label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="contoh: Gudang Cabang 2"
              className="w-full h-10 border rounded-xl px-3 text-sm border-slate-200"
            />
          </div>
          <div>
            <label className="text-[10.5px] font-bold uppercase tracking-widest text-slate-400 block mb-1">
              Icon (emoji)
            </label>
            <input
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              className="w-20 h-10 border rounded-xl px-3 text-lg text-center border-slate-200"
            />
          </div>
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
            <input type="checkbox" checked={isPkl} onChange={(e) => setIsPkl(e.target.checked)} />
            Role ini untuk PKL / magang
          </label>
          <div>
            <label className="text-[10.5px] font-bold uppercase tracking-widest text-slate-400 block mb-1">
              Warisi akses dari role custom lain (opsional)
            </label>
            <select
              value={parentRole}
              onChange={(e) => setParentRole(e.target.value)}
              className="w-full h-10 border rounded-xl px-3 text-sm border-slate-200 bg-white"
            >
              <option value="">— Tidak ada —</option>
              {parentOptions.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex gap-2.5 mt-5">
          <button onClick={onClose} className="flex-1 h-10 rounded-xl text-sm font-semibold bg-slate-100 text-slate-600">
            Batal
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="flex-1 h-10 rounded-xl text-sm font-bold text-white disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #0f0c29, #1a1545)" }}
          >
            {saving ? "Menyimpan..." : isEdit ? "Simpan Perubahan" : "Buat Role"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal Konfirmasi Hapus Role ───────────────────────────────────────────────
function ConfirmDeleteRoleModal({
  role,
  loading,
  onClose,
  onConfirm,
}: {
  role: DynamicRoleRow;
  loading: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" style={{ backdropFilter: "blur(6px)" }} onClick={onClose} />
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-sm p-7">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
          style={{ background: "#fff1f2", border: "1px solid #fecaca" }}
        >
          <Trash2 className="w-8 h-8" style={{ color: "#dc2626" }} />
        </div>
        <h3 className="font-black text-slate-800 text-center text-base mb-1">
          Hapus Role {role.label}?
        </h3>
        <p className="text-sm text-slate-400 text-center mb-2 leading-relaxed">
          Role beserta seluruh hak akses halamannya akan dihapus permanen.
        </p>
        <div
          className="px-3 py-2 rounded-xl mb-5 text-center text-xs font-semibold flex items-center justify-center gap-1.5"
          style={{ background: "#fff1f2", color: "#be123c", border: "1px solid #fecdd3" }}
        >
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" /> Tindakan ini tidak bisa dibatalkan!
        </div>
        <div className="flex gap-2.5">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 h-10 rounded-xl text-sm font-semibold disabled:opacity-50 transition-all hover:bg-slate-200"
            style={{ background: "#f1f5f9", color: "#64748b" }}
          >
            Batal
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 h-10 rounded-xl text-sm font-bold text-white disabled:opacity-50 flex items-center justify-center gap-2 transition-all active:scale-95"
            style={{ background: "linear-gradient(135deg, #dc2626, #991b1b)" }}
          >
            {loading ? (
              <div
                className="w-4 h-4 border-2 rounded-full animate-spin"
                style={{ borderColor: "rgba(255,255,255,0.3)", borderTopColor: "#fff" }}
              />
            ) : (
              <>
                <Trash2 className="w-4 h-4" /> Ya, Hapus
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function RoleAccessManager() {
  const [dynamicRoles, setDynamicRoles] = useState<DynamicRoleRow[]>([]);
  const [legacyRoles, setLegacyRoles] = useState<LegacyRoleRow[]>([]);
  const [pages, setPages] = useState<AppPageRow[]>([]);
  const [selectedRole, setSelectedRole] = useState<SelectedRole | null>(null);
  const [permMap, setPermMap] = useState<Record<string, Omit<PermRow, "page_key">>>({});
  const [autoDetected, setAutoDetected] = useState(false);
  const [loadingRoles, setLoadingRoles] = useState(true);
  const [loadingMatrix, setLoadingMatrix] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editRole, setEditRole] = useState<DynamicRoleRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DynamicRoleRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "err" } | null>(null);
  const [legacySearch, setLegacySearch] = useState("");

  const showToast = (msg: string, type: "ok" | "err") => setToast({ msg, type });

  const loadRoles = async () => {
    setLoadingRoles(true);
    try {
      const res = await fetch("/api/admin/roles");
      const data = await res.json();
      if (data.success) {
        setDynamicRoles(data.roles);
        setLegacyRoles(data.legacyRoles ?? []);
      }
    } finally {
      setLoadingRoles(false);
    }
  };

  const loadPages = async () => {
    const res = await fetch("/api/admin/pages");
    const data = await res.json();
    if (data.success) setPages(data.pages);
  };

  const handleDeleteRole = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/roles?id=${encodeURIComponent(deleteTarget.id)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!data.success) {
        showToast(data.message ?? "Gagal menghapus role", "err");
        return;
      }
      // Kalau role yang dihapus sedang dibuka matrix-nya, kosongkan panel kanan
      // supaya tidak menyimpan permission ke role yang sudah tidak ada.
      if (selectedRole?.key === deleteTarget.key) {
        setSelectedRole(null);
        setPermMap({});
      }
      showToast(`Role "${deleteTarget.label}" berhasil dihapus`, "ok");
      await loadRoles();
    } catch {
      showToast("Terjadi kesalahan", "err");
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  // Kalau label role yang sedang dibuka diubah lewat modal Edit,
  // sinkronkan judul di panel kanan supaya tidak menampilkan nama lama.
  const handleRoleSaved = async () => {
    await loadRoles();
    if (editRole && selectedRole?.key === editRole.key) {
      setSelectedRole((prev) => (prev ? { ...prev } : prev));
    }
  };

  useEffect(() => {
    loadRoles();
    loadPages();
  }, []);

  // Judul panel kanan diambil dari data terbaru dynamicRoles (bukan snapshot
  // saat diklik), supaya hasil edit langsung terlihat tanpa klik ulang.
  const selectedRoleDisplay = useMemo(() => {
    if (!selectedRole) return null;
    if (selectedRole.kind === "dynamic") {
      const fresh = dynamicRoles.find((r) => r.key === selectedRole.key);
      if (fresh) return { label: fresh.label, icon: fresh.icon };
    }
    return { label: selectedRole.label, icon: selectedRole.icon };
  }, [selectedRole, dynamicRoles]);

  const loadMatrixFor = async (role: SelectedRole) => {
    setSelectedRole(role);
    setLoadingMatrix(true);
    try {
      const res = await fetch(`/api/admin/role-permissions?role_key=${encodeURIComponent(role.key)}`);
      const data = await res.json();
      const map: Record<string, Omit<PermRow, "page_key">> = {};
      if (data.success) {
        for (const row of data.permissions as PermRow[]) {
          map[row.page_key] = {
            can_view: row.can_view,
            can_create: row.can_create,
            can_edit: row.can_edit,
            can_delete: row.can_delete,
          };
        }
        setAutoDetected(!!data.autoDetected);
      }
      setPermMap(map);
    } finally {
      setLoadingMatrix(false);
    }
  };

  const toggle = (pageKey: string, field: keyof Omit<PermRow, "page_key">) => {
    setPermMap((prev) => {
      const current = prev[pageKey] ?? { ...EMPTY_PERM };
      const next = { ...current, [field]: !current[field] };
      if (field === "can_view" && !next.can_view) {
        next.can_create = false;
        next.can_edit = false;
        next.can_delete = false;
      }
      if (field !== "can_view" && next[field]) {
        next.can_view = true;
      }
      return { ...prev, [pageKey]: next };
    });
  };

  const toggleAllInGroup = (groupPages: AppPageRow[], field: keyof Omit<PermRow, "page_key">, value: boolean) => {
    setPermMap((prev) => {
      const next = { ...prev };
      for (const p of groupPages) {
        const current = next[p.key] ?? { ...EMPTY_PERM };
        const updated = { ...current, [field]: value };
        if (field === "can_view" && !value) {
          updated.can_create = false;
          updated.can_edit = false;
          updated.can_delete = false;
        }
        if (field !== "can_view" && value) updated.can_view = true;
        next[p.key] = updated;
      }
      return next;
    });
  };

  const save = async () => {
    if (!selectedRole) return;
    setSaving(true);
    try {
      const permissions = pages.map((p) => ({
        page_key: p.key,
        ...(permMap[p.key] ?? EMPTY_PERM),
      }));
      const res = await fetch("/api/admin/role-permissions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role_key: selectedRole.key, permissions }),
      });
      const data = await res.json();
      if (!data.success) {
        showToast(data.message ?? "Gagal menyimpan", "err");
        return;
      }
      setAutoDetected(false);
      showToast(`Hak akses "${selectedRole.label}" berhasil disimpan`, "ok");
    } catch {
      showToast("Terjadi kesalahan", "err");
    } finally {
      setSaving(false);
    }
  };

  const groupedPages = useMemo(() => {
    const groups = new Map<string, AppPageRow[]>();
    for (const p of pages) {
      const list = groups.get(p.group_label) ?? [];
      list.push(p);
      groups.set(p.group_label, list);
    }
    return Array.from(groups.entries());
  }, [pages]);

  const filteredLegacyRoles = useMemo(() => {
    if (!legacySearch.trim()) return legacyRoles;
    const q = legacySearch.toLowerCase();
    return legacyRoles.filter((r) => r.label.toLowerCase().includes(q) || r.key.toLowerCase().includes(q));
  }, [legacyRoles, legacySearch]);

  return (
    <div className="space-y-4">
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      {(showCreate || editRole) && (
        <RoleFormModal
          key={editRole?.id ?? "create"}
          role={editRole}
          existingRoles={dynamicRoles}
          onClose={() => {
            setShowCreate(false);
            setEditRole(null);
          }}
          onSaved={handleRoleSaved}
        />
      )}

      {deleteTarget && (
        <ConfirmDeleteRoleModal
          role={deleteTarget}
          loading={deleting}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDeleteRole}
        />
      )}

      <div className="flex flex-col lg:flex-row gap-4 lg:gap-5 items-start">
        {/* ── Daftar role (Bawaan + Custom) ── */}
       <div className="w-full lg:w-72 flex-shrink-0 space-y-3">          {/* Role Bawaan (legacy, auto-detect) */}
          <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
            <div className="px-4 py-3.5 border-b border-slate-100">
              <p className="text-[11px] font-bold text-slate-500">Role Bawaan Sistem ({legacyRoles.length})</p>
              <p className="text-[9.5px] text-slate-400 mt-0.5">Otomatis terdeteksi dari kode — klik untuk lihat akses saat ini</p>
              <input
                value={legacySearch}
                onChange={(e) => setLegacySearch(e.target.value)}
                placeholder="Cari role..."
                className="w-full h-8 mt-2 rounded-lg px-2.5 text-[11px] border border-slate-200 bg-slate-50"
              />
            </div>
            {loadingRoles ? (
              <div className="p-4 text-xs text-slate-400">Memuat...</div>
            ) : (
              <div className="max-h-64 overflow-y-auto">
                {filteredLegacyRoles.map((r) => (
                  <button
                    key={r.key}
                    onClick={() => loadMatrixFor({ kind: "legacy", key: r.key, label: r.label, icon: "🏷️" })}
                    className={`w-full text-left px-4 py-2.5 text-[13px] font-semibold flex items-center gap-2 border-b border-slate-50 transition ${selectedRole?.key === r.key ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-50"
                      }`}
                  >
                    <span className="flex-1 truncate">{r.label}</span>
                  </button>
                ))}
                {filteredLegacyRoles.length === 0 && (
                  <div className="p-4 text-center text-xs text-slate-400">Tidak ditemukan</div>
                )}
              </div>
            )}
          </div>

          {/* Role Custom (dynamic_roles) */}
          <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
            <div className="px-4 py-3.5 border-b border-slate-100 flex items-center justify-between">
              <p className="text-[11px] font-bold text-slate-500">Role Custom ({dynamicRoles.length})</p>
              <button
                onClick={() => setShowCreate(true)}
                className="text-[10px] font-bold px-2.5 py-1.5 rounded-lg text-white"
                style={{ background: "linear-gradient(135deg, #0f0c29, #1a1545)" }}
              >
                + Buat Role
              </button>
            </div>
            {loadingRoles ? (
              <div className="p-4 text-xs text-slate-400">Memuat...</div>
            ) : dynamicRoles.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">
                Belum ada role custom.
                <br />
                Klik &quot;Buat Role&quot; untuk mulai.
              </div>
            ) : (
              <div className="max-h-64 overflow-y-auto">
                {dynamicRoles.map((r) => (
                  // Row dibungkus <div>, BUKAN <button>.
                  // Kalau tombol Edit/Delete ditaruh di dalam <button>, HTML jadi
                  // invalid (nested button) → hydration mismatch + klik ikut
                  // men-trigger loadMatrixFor karena event bubbling.
                  <div
                    key={r.id}
                    className={`flex items-center border-b border-slate-50 transition ${selectedRole?.key === r.key ? "bg-violet-50" : "hover:bg-slate-50"
                      }`}
                  >
                    <button
                      type="button"
                      onClick={() => loadMatrixFor({ kind: "dynamic", key: r.key, label: r.label, icon: r.icon })}
                      className={`flex-1 min-w-0 text-left pl-4 pr-2 py-3 text-sm font-semibold flex items-center gap-2 ${selectedRole?.key === r.key ? "text-violet-700" : "text-slate-600"
                        }`}
                    >
                      <span className="flex-shrink-0">{r.icon}</span>
                      <span className="flex-1 truncate">{r.label}</span>
                      {r.is_pkl && (
                        <span className="text-[9px] font-bold text-amber-600 flex-shrink-0">PKL</span>
                      )}
                    </button>
                    <div className="flex items-center gap-1 pr-3 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => setEditRole(r)}
                        title={`Edit role ${r.label}`}
                        className="w-7 h-7 flex items-center justify-center rounded-lg transition-all hover:scale-110 active:scale-95"
                        style={{ background: "#f0f9ff", color: "#0369a1" }}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(r)}
                        title={`Hapus role ${r.label}`}
                        className="w-7 h-7 flex items-center justify-center rounded-lg transition-all hover:scale-110 active:scale-95"
                        style={{ background: "#fff1f2", color: "#dc2626" }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Matrix permission ── */}
        <div className="flex-1 min-w-0 w-full bg-white rounded-2xl border border-slate-100 overflow-hidden">
          {!selectedRole ? (
            <div className="p-10 text-center text-sm text-slate-400">
              Pilih role di sebelah kiri untuk lihat/atur hak akses halaman & aksi.
            </div>
          ) : loadingMatrix ? (
            <div className="p-10 text-center text-sm text-slate-400">Memuat matrix...</div>
          ) : (
            <>
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-black text-slate-800 truncate">
                    {selectedRoleDisplay?.icon} {selectedRoleDisplay?.label}
                  </p>
                  {autoDetected ? (
                    <p className="text-[10.5px] mt-0.5 flex items-center gap-1.5">
                      <span className="px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 font-bold text-[9px] border border-amber-200">
                        OTOMATIS TERDETEKSI
                      </span>
                      <span className="text-slate-400">dari kode saat ini — belum pernah disimpan manual</span>
                    </p>
                  ) : (
                    <p className="text-[10.5px] text-slate-400 mt-0.5">
                      Centang halaman yang boleh diakses, lalu pilih aksi yang diizinkan.
                    </p>
                  )}
                </div>
                <button
                  onClick={save}
                  disabled={saving}
                  className="h-9 px-4 rounded-xl text-xs font-bold text-white disabled:opacity-50 flex-shrink-0"
                  style={{ background: "linear-gradient(135deg, #059669, #047857)" }}
                >
                  {saving ? "Menyimpan..." : <span className="flex items-center gap-1.5"><Save className="w-3.5 h-3.5" /> Simpan</span>}
                </button>
              </div>

              {selectedRole.kind === "legacy" && (
                <div className="px-5 py-2.5 bg-blue-50/60 border-b border-blue-100 text-[10.5px] text-blue-700 leading-relaxed">
                  ℹ️ Role ini dikontrol dari kode (<code>permissions.ts</code>). Kolom <b>View</b> di atas mencerminkan
                  akses yang sekarang berlaku. Kalau disimpan, perubahan di sini akan{" "}
                  <b>menambah</b> akses tambahan untuk role ini — akses yang sudah ada dari kode tidak akan berkurang.
                </div>
              )}

              <div className="max-h-[55vh] overflow-y-auto">
                {groupedPages.map(([groupLabel, groupPages]) => (
                  <div key={groupLabel} className="border-b border-slate-50">
                    <div className="px-5 py-2 bg-slate-50 flex items-center justify-between">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{groupLabel}</p>
                      <div className="flex gap-3 text-[9px] font-bold text-slate-400">
                        <button onClick={() => toggleAllInGroup(groupPages, "can_view", true)} className="hover:text-violet-600">
                          Centang semua
                        </button>
                        <button onClick={() => toggleAllInGroup(groupPages, "can_view", false)} className="hover:text-red-600">
                          Kosongkan
                        </button>
                      </div>
                    </div>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-[10px] text-slate-400">
                          <th className="text-left font-semibold px-5 py-1.5 w-1/3">Halaman</th>
                          <th className="font-semibold py-1.5 w-1/6">View</th>
                          <th className="font-semibold py-1.5 w-1/6">Create</th>
                          <th className="font-semibold py-1.5 w-1/6">Edit</th>
                          <th className="font-semibold py-1.5 w-1/6">Delete</th>
                        </tr>
                      </thead>
                      <tbody>
                        {groupPages.map((p) => {
                          const perm = permMap[p.key] ?? EMPTY_PERM;
                          return (
                            <tr key={p.key} className="hover:bg-slate-50/60">
                              <td className="px-5 py-2 font-semibold text-slate-700">{p.label}</td>
                              {(["can_view", "can_create", "can_edit", "can_delete"] as const).map((field) => (
                                <td key={field} className="text-center py-2">
                                  <input
                                    type="checkbox"
                                    checked={perm[field]}
                                    onChange={() => toggle(p.key, field)}
                                    className="w-4 h-4 accent-violet-600 cursor-pointer"
                                  />
                                </td>
                              ))}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}