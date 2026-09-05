"use client";

import { useCallback, useEffect, useMemo, useState, use } from "react";
import { notFound } from "next/navigation";
import { Plus, X, Pencil, Trash2, ShieldCheck, ChevronLeft, ChevronRight, Loader2, AlertTriangle } from "lucide-react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { getAuthUser } from "@/hooks/useAuthUser";
import { AUDIT_LEADS_INPUT_ROLES, AUDIT_LEADS_AUDIT_ROLES, hasAnyRole } from "@/lib/permissions";

type Channel = "WA" | "FB" | "OLX" | "CAROUSEL" | "MITRA" | "RESELLER";

const SLUG_TO_CHANNEL: Record<string, Channel> = {
  wa: "WA", fb: "FB", olx: "OLX", carousell: "CAROUSEL", mitra: "MITRA", reseller: "RESELLER",
};

const channelLabels: Record<Channel, string> = {
  WA: "WhatsApp", FB: "Facebook", OLX: "OLX", CAROUSEL: "Carousell", MITRA: "Mitra", RESELLER: "Reseller",
};

interface LeadRow {
  id: string; channel: Channel; nama: string; minat: string; keterangan: string | null;
  transaksi: boolean; ads: boolean; audited: boolean; audited_by_name: string | null;
  created_by: string; created_by_name: string; created_at: string;
  source: "manual" | "sales_report";
}

const PAGE_SIZE = 10;

async function parseApiResponse(res: Response) {
  const text = await res.text();
  if (!text) throw new Error(`Server merespons kosong (status ${res.status}).`);
  try { return JSON.parse(text); }
  catch { throw new Error(`Response bukan JSON (status ${res.status}): ${text.slice(0, 200)}`); }
}

export default function AuditLeadsChannelPage({ params }: { params: Promise<{ channel: string }> }) {
  const { channel: channelSlug } = use(params);
  const channel = SLUG_TO_CHANNEL[channelSlug.toLowerCase()];
  if (!channel) notFound();

  const [userRoles, setUserRoles] = useState<string[]>([]);
  const [rows, setRows] = useState<LeadRow[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingRow, setEditingRow] = useState<LeadRow | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmAuditId, setConfirmAuditId] = useState<string | null>(null);

  const canInput = hasAnyRole(userRoles, AUDIT_LEADS_INPUT_ROLES);
  const canAudit = hasAnyRole(userRoles, AUDIT_LEADS_AUDIT_ROLES);

  const fetchRows = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/audit-leads?channel=${channel}`);
      const json = await parseApiResponse(res);
      if (!json.success) throw new Error(json.message);
      setRows(json.data as LeadRow[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat data.");
    } finally { setLoading(false); }
  }, [channel]);

  // Ambil user + roles dari hook yang sama dipakai Sidebar (getAuthUser),
  // supaya cache-nya konsisten dan user multi-role tetap kedeteksi lewat
  // .roles (bukan cuma .role tunggal).
  useEffect(() => {
    getAuthUser().then((u) => {
      const roles = Array.isArray(u?.roles) && u.roles.length > 0 ? u.roles : u?.role ? [u.role] : [];
      setUserRoles(roles);
    });
  }, []);

  useEffect(() => { fetchRows(); setPage(1); }, [fetchRows]);

  const paginated = useMemo(() => rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [rows, page]);
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));

    async function handleAudit(id: string) {
    try {
      const target = rows.find((r) => r.id === id);
      const endpoint = target?.source === "sales_report" ? "/api/sales-reports/audit" : "/api/audit-leads/audit";
      const res = await fetch(endpoint, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }),
      });
      const json = await parseApiResponse(res);
      if (!json.success) throw new Error(json.message);
      await fetchRows();
    } catch (err) { setError(err instanceof Error ? err.message : "Gagal audit data."); }
    finally { setConfirmAuditId(null); }
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/audit-leads?id=${id}`, { method: "DELETE" });
      const json = await parseApiResponse(res);
      if (!json.success) throw new Error(json.message);
      await fetchRows();
    } catch (err) { setError(err instanceof Error ? err.message : "Gagal hapus data."); }
    finally { setConfirmDeleteId(null); }
  }

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-600 to-violet-800 p-6 text-white">
          <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10" />
          <h1 className="text-xl font-semibold">Audit Marketing — {channelLabels[channel]}</h1>
          <p className="text-violet-100 text-sm mt-1">Sales input leads dari {channelLabels[channel]}, Marketing audit hasil kerjanya di sini.</p>
        </div>

        {canInput && (
          <button onClick={() => { setEditingRow(null); setShowForm(true); }}
            className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700">
            <Plus className="h-4 w-4" /> Tambah Leads
          </button>
        )}

        {error && (
          <div className="rounded-lg bg-red-50 text-red-600 px-4 py-3 text-sm flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" /> {error}
          </div>
        )}

        <div className="overflow-x-auto rounded-xl border border-violet-100">
          <table className="w-full text-sm">
            <thead className="bg-violet-50 text-violet-700">
              <tr>
                <th className="px-3 py-2 text-left">No</th>
                <th className="px-3 py-2 text-left">Nama</th>
                <th className="px-3 py-2 text-left">Minat</th>
                <th className="px-3 py-2 text-left">Keterangan</th>
                <th className="px-3 py-2 text-center">Transaksi</th>
                <th className="px-3 py-2 text-center">Ads</th>
                <th className="px-3 py-2 text-center">Audit</th>
                <th className="px-3 py-2 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="px-3 py-8 text-center text-gray-400"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></td></tr>
              ) : paginated.length === 0 ? (
                <tr><td colSpan={8} className="px-3 py-8 text-center text-gray-400">Belum ada data untuk channel {channelLabels[channel]}.</td></tr>
              ) : (
                paginated.map((row, i) => (
                  <tr key={row.id} className="border-t border-violet-50">
                    <td className="px-3 py-2">{(page - 1) * PAGE_SIZE + i + 1}</td>
                    <td className="px-3 py-2">
                      {row.nama}
                      {row.source === "sales_report" && (
                        <div className="text-[10px] text-gray-400 mt-0.5">via Laporan Sales</div>
                      )}
                    </td>
                    <td className="px-3 py-2">{row.minat}</td>
                    <td className="px-3 py-2 text-gray-500">{row.keterangan || "-"}</td>
                    <td className="px-3 py-2 text-center">{row.transaksi ? "✅" : "❌"}</td>
                                        <td className="px-3 py-2 text-center">{row.source === "sales_report" ? "–" : row.ads ? "✅" : "❌"}</td>
                    <td className="px-3 py-2 text-center">
                      {row.audited ? (
                        <span className="inline-flex items-center gap-1 text-emerald-600 text-xs"><ShieldCheck className="h-4 w-4" /> {row.audited_by_name}</span>
                      ) : canAudit ? (
                        <button onClick={() => setConfirmAuditId(row.id)} className="text-xs text-violet-600 underline">Audit</button>
                      ) : (
                        <span className="text-xs text-gray-400">Belum</span>
                      )}
                    </td>
                                        <td className="px-3 py-2 text-center">
                      {!row.audited && row.source === "manual" && (
                        <div className="flex items-center justify-center gap-2">
                          <button onClick={() => { setEditingRow(row); setShowForm(true); }}><Pencil className="h-4 w-4 text-gray-500 hover:text-violet-600" /></button>
                          <button onClick={() => setConfirmDeleteId(row.id)}><Trash2 className="h-4 w-4 text-gray-500 hover:text-red-600" /></button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-end gap-2 text-sm">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="p-1 disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button>
          <span>Halaman {page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="p-1 disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
        </div>

        {showForm && (
          <LeadFormModal channel={channel} editingRow={editingRow} onClose={() => setShowForm(false)}
            onSaved={() => { setShowForm(false); fetchRows(); }} />
        )}
        {confirmAuditId && (
          <ConfirmModal title="Audit leads ini?" description="Setelah diaudit, data ini terkunci dan tidak bisa diedit/dihapus tim sales."
            onCancel={() => setConfirmAuditId(null)} onConfirm={() => handleAudit(confirmAuditId)} />
        )}
        {confirmDeleteId && (
          <ConfirmModal title="Hapus leads ini?" description="Data yang dihapus tidak bisa dikembalikan."
            onCancel={() => setConfirmDeleteId(null)} onConfirm={() => handleDelete(confirmDeleteId)} />
        )}
      </div>
    </DashboardLayout>
  );
}

function ConfirmModal({ title, description, onCancel, onConfirm }: { title: string; description: string; onCancel: () => void; onConfirm: () => void; }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 w-full max-w-sm space-y-4">
        <h3 className="font-semibold">{title}</h3>
        <p className="text-sm text-gray-500">{description}</p>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="px-4 py-2 text-sm rounded-lg border">Batal</button>
          <button onClick={onConfirm} className="px-4 py-2 text-sm rounded-lg bg-violet-600 text-white">Ya, lanjutkan</button>
        </div>
      </div>
    </div>
  );
}

function LeadFormModal({ channel, editingRow, onClose, onSaved }: { channel: Channel; editingRow: LeadRow | null; onClose: () => void; onSaved: () => void; }) {
  const [nama, setNama] = useState(editingRow?.nama ?? "");
  const [minat, setMinat] = useState(editingRow?.minat ?? "");
  const [keterangan, setKeterangan] = useState(editingRow?.keterangan ?? "");
  const [transaksi, setTransaksi] = useState(editingRow?.transaksi ?? false);
  const [ads, setAds] = useState(editingRow?.ads ?? false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleSubmit() {
    if (!nama.trim() || !minat.trim()) { setErr("Nama dan minat wajib diisi."); return; }
    setSaving(true); setErr(null);
    try {
      const method = editingRow ? "PATCH" : "POST";
      const body = editingRow
        ? { id: editingRow.id, nama, minat, keterangan, transaksi, ads }
        : { channel, nama, minat, keterangan, transaksi, ads };
      const res = await fetch("/api/audit-leads", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await parseApiResponse(res);
      if (!json.success) throw new Error(json.message);
      onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : "Gagal menyimpan data."); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 w-full max-w-md space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="font-semibold">{editingRow ? "Edit Leads" : "Tambah Leads"} — {channelLabels[channel]}</h3>
          <button onClick={onClose}><X className="h-4 w-4" /></button>
        </div>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <input value={nama} onChange={(e) => setNama(e.target.value)} placeholder="Nama / username" className="w-full rounded-lg border px-3 py-2 text-sm" />
        <input value={minat} onChange={(e) => setMinat(e.target.value)} placeholder="Minat (misal: Lenovo x270)" className="w-full rounded-lg border px-3 py-2 text-sm" />
        <textarea value={keterangan ?? ""} onChange={(e) => setKeterangan(e.target.value)} placeholder="Keterangan (opsional)" className="w-full rounded-lg border px-3 py-2 text-sm" />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={transaksi} onChange={(e) => setTransaksi(e.target.checked)} /> Transaksi (jadi beli)</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={ads} onChange={(e) => setAds(e.target.checked)} /> Dari Ads (bukan organik)</label>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border">Batal</button>
          <button onClick={handleSubmit} disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-violet-600 text-white disabled:opacity-50">{saving ? "Menyimpan..." : "Simpan"}</button>
        </div>
      </div>
    </div>
  );
}