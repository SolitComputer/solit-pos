"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { hasAnyRole, PARTNER_MANAGE_ROLES } from "@/lib/permissions";
import DashboardLayout from "@/components/layout/DashboardLayout";

interface Partner {
  id: string;
  type: "MITRA" | "RESELLER";
  status: "PENDING" | "APPROVED" | "REJECTED";
  full_name: string;
  phone: string;
  email: string;
  full_address: string;
  follow_proof_url: string | null;
  follow_proof_urls?: string[] | null;
  approver: { id: string; name: string } | null;
  rejector: { id: string; name: string } | null;
  rejection_reason: string | null;
  notes: string | null;
  created_at: string;
  approved_at: string | null;
  rejected_at: string | null;
}

const STATUS_STYLE: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800",
  APPROVED: "bg-emerald-100 text-emerald-800",
  REJECTED: "bg-red-100 text-red-800",
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Menunggu",
  APPROVED: "Diterima",
  REJECTED: "Ditolak",
};

const TYPE_STYLE: Record<string, string> = {
  MITRA: "bg-blue-100 text-blue-800",
  RESELLER: "bg-violet-100 text-violet-800",
};

export default function MitraResellerClient() {
  const [data, setData] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [search, setSearch] = useState("");
  const [userRoles, setUserRoles] = useState<string[]>([]);

  // Modal state
  const [modalPartner, setModalPartner] = useState<Partner | null>(null);
  const [modalAction, setModalAction] = useState<"approve" | "reject" | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [previewIndex, setPreviewIndex] = useState(0);

  const canManage = useMemo(() => hasAnyRole(userRoles, PARTNER_MANAGE_ROLES), [userRoles]);

  // Helper: gabungkan follow_proof_urls dan follow_proof_url (backward compat)
  const getProofUrls = useCallback((p: Partner): string[] => {
    if (p.follow_proof_urls && p.follow_proof_urls.length > 0) return p.follow_proof_urls;
    if (p.follow_proof_url) return [p.follow_proof_url];
    return [];
  }, []);

  const openGallery = useCallback((urls: string[], startIndex = 0) => {
    setPreviewUrls(urls);
    setPreviewIndex(startIndex);
  }, []);

  // Fetch user roles
  useEffect(() => {
    (async () => {
      try {
        const { getAuthUser } = await import("@/hooks/useAuthUser");
        const user = await getAuthUser();
        if (user) setUserRoles(user.roles ?? [user.role].filter(Boolean));
      } catch {}
    })();
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      if (typeFilter !== "ALL") params.set("type", typeFilter);
      if (search.trim()) params.set("search", search.trim());

      const res = await fetch(`/api/partners?${params.toString()}`);
      const json = await res.json();
      if (json.success) setData(json.data ?? []);
    } catch (err) {
      console.error("Gagal fetch partners:", err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, typeFilter, search]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAction = async () => {
    if (!modalPartner || !modalAction) return;
    if (modalAction === "reject" && !rejectReason.trim()) return;

    setActionLoading(true);
    try {
      const res = await fetch("/api/partners", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: modalPartner.id,
          action: modalAction,
          rejection_reason: modalAction === "reject" ? rejectReason : undefined,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setModalPartner(null);
        setModalAction(null);
        setRejectReason("");
        fetchData();
      } else {
        alert(json.message || "Gagal");
      }
    } catch {
      alert("Terjadi kesalahan");
    } finally {
      setActionLoading(false);
    }
  };

  // Stats
  const stats = useMemo(() => {
    const all = data;
    return {
      total: all.length,
      pending: all.filter((p) => p.status === "PENDING").length,
      approved: all.filter((p) => p.status === "APPROVED").length,
      rejected: all.filter((p) => p.status === "REJECTED").length,
    };
  }, [data]);

  const formatDate = (d: string) => {
    return new Date(d).toLocaleDateString("id-ID", {
      day: "numeric", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  };

  return (
    <DashboardLayout>
    <div className="p-4 md:p-6 space-y-5 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">
          Mitra & Reseller
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Kelola pendaftaran mitra dan reseller Solit
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total", value: stats.total, color: "bg-slate-50 border-slate-200" },
          { label: "Menunggu", value: stats.pending, color: "bg-amber-50 border-amber-200" },
          { label: "Diterima", value: stats.approved, color: "bg-emerald-50 border-emerald-200" },
          { label: "Ditolak", value: stats.rejected, color: "bg-red-50 border-red-200" },
        ].map((s) => (
          <div key={s.label} className={`rounded-2xl border p-4 ${s.color}`}>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{s.label}</p>
            <p className="text-2xl font-black text-slate-900 mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap gap-2">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
        >
          <option value="ALL">Semua Status</option>
          <option value="PENDING">Menunggu</option>
          <option value="APPROVED">Diterima</option>
          <option value="REJECTED">Ditolak</option>
        </select>

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
        >
          <option value="ALL">Semua Tipe</option>
          <option value="MITRA">Mitra</option>
          <option value="RESELLER">Reseller</option>
        </select>

        <div className="relative flex-1 min-w-[200px]">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama, HP, email..."
            className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
          />
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50">
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Nama</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Tipe</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600 hidden md:table-cell">No HP</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600 hidden lg:table-cell">Email</th>
                <th className="text-center px-4 py-3 font-semibold text-slate-600 hidden md:table-cell">Bukti Follow</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Status</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600 hidden md:table-cell">Tanggal</th>
                {canManage && <th className="text-center px-4 py-3 font-semibold text-slate-600">Aksi</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-slate-50">
                    <td colSpan={canManage ? 8 : 7} className="px-4 py-4">
                      <div className="h-5 bg-slate-100 rounded animate-pulse" style={{ width: `${60 + i * 8}%` }} />
                    </td>
                  </tr>
                ))
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan={canManage ? 8 : 7} className="px-4 py-12 text-center text-slate-400">
                    {search ? `Tidak ada hasil untuk "${search}"` : "Belum ada pendaftaran"}
                  </td>
                </tr>
              ) : (
                data.map((p) => (
                  <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition">
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-semibold text-slate-900">{p.full_name}</p>
                        <p className="text-xs text-slate-400 md:hidden">{p.phone}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2.5 py-1 rounded-lg text-xs font-bold ${TYPE_STYLE[p.type]}`}>
                        {p.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-slate-600">{p.phone}</td>
                    <td className="px-4 py-3 hidden lg:table-cell text-slate-600">{p.email}</td>
                    <td className="px-4 py-3 hidden md:table-cell text-center">
                      {(() => {
                        const urls = getProofUrls(p);
                        if (urls.length === 0) return <span className="text-xs text-slate-400">—</span>;
                        return (
                          <div className="inline-flex items-center gap-1">
                            <button
                              onClick={() => openGallery(urls, 0)}
                              className="relative inline-block rounded-lg overflow-hidden border border-slate-200 hover:border-indigo-400 hover:shadow-md transition"
                              title={`Lihat bukti follow (${urls.length} foto)`}
                            >
                              <img
                                src={urls[0]}
                                alt="Bukti follow"
                                className="w-10 h-10 object-cover"
                              />
                              {urls.length > 1 && (
                                <span className="absolute bottom-0 right-0 bg-black/70 text-white text-[10px] font-bold px-1 rounded-tl">
                                  +{urls.length - 1}
                                </span>
                              )}
                            </button>
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2.5 py-1 rounded-lg text-xs font-bold ${STATUS_STYLE[p.status]}`}>
                        {STATUS_LABEL[p.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-xs text-slate-500">
                      {formatDate(p.created_at)}
                    </td>
                    {canManage && (
                      <td className="px-4 py-3 text-center">
                        {p.status === "PENDING" ? (
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => { setModalPartner(p); setModalAction("approve"); }}
                              className="px-3 py-1.5 text-xs font-bold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition"
                            >
                              Terima
                            </button>
                            <button
                              onClick={() => { setModalPartner(p); setModalAction("reject"); }}
                              className="px-3 py-1.5 text-xs font-bold rounded-lg bg-red-600 text-white hover:bg-red-700 transition"
                            >
                              Tolak
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Link Pendaftaran */}
      <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4">
        <p className="text-sm font-semibold text-indigo-900">Link Pendaftaran</p>
        <p className="text-xs text-indigo-600 mt-1">
          Bagikan link ini ke customer untuk mendaftar sebagai Mitra / Reseller:
        </p>
        <div className="mt-2 flex items-center gap-2">
          <code className="flex-1 px-3 py-2 bg-white rounded-lg border border-indigo-200 text-sm text-indigo-800 font-mono truncate">
            https://www.solit.id/daftar-mitra
          </code>
          <button
            onClick={() => {
              navigator.clipboard.writeText("https://www.solit.id/daftar-mitra");
              alert("Link disalin!");
            }}
            className="px-3 py-2 text-xs font-bold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition flex-shrink-0"
          >
            Salin
          </button>
        </div>
      </div>

      {/* Modal Approve / Reject */}
      {modalPartner && modalAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => { setModalPartner(null); setModalAction(null); setRejectReason(""); }}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-black text-slate-900">
              {modalAction === "approve" ? "Terima Pendaftaran" : "Tolak Pendaftaran"}
            </h2>

            <div className="space-y-1 text-sm">
              <p><span className="text-slate-500">Nama:</span> <span className="font-semibold">{modalPartner.full_name}</span></p>
              <p><span className="text-slate-500">Tipe:</span> <span className="font-semibold">{modalPartner.type}</span></p>
              <p><span className="text-slate-500">HP:</span> {modalPartner.phone}</p>
              <p><span className="text-slate-500">Email:</span> {modalPartner.email}</p>
              <p><span className="text-slate-500">Alamat:</span> {modalPartner.full_address}</p>
              {(() => {
                const urls = getProofUrls(modalPartner);
                if (urls.length === 0) return null;
                return (
                  <div className="pt-1">
                    <span className="text-slate-500">Bukti Follow:</span>
                    <button
                      onClick={() => openGallery(urls, 0)}
                      className="ml-2 text-indigo-600 text-xs font-semibold hover:underline"
                    >
                      Lihat Foto ({urls.length})
                    </button>
                    {urls.length > 1 && (
                      <div className="flex gap-1.5 mt-2">
                        {urls.map((url, i) => (
                          <button
                            key={i}
                            onClick={() => openGallery(urls, i)}
                            className="rounded-lg overflow-hidden border border-slate-200 hover:border-indigo-400 transition"
                          >
                            <img src={url} alt={`Bukti ${i + 1}`} className="w-10 h-10 object-cover" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            {modalAction === "reject" && (
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Alasan Penolakan <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Tulis alasan penolakan..."
                  rows={3}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-red-500/30 resize-none"
                />
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => { setModalPartner(null); setModalAction(null); setRejectReason(""); }}
                className="flex-1 px-4 py-2.5 text-sm font-semibold rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition"
                disabled={actionLoading}
              >
                Batal
              </button>
              <button
                onClick={handleAction}
                disabled={actionLoading || (modalAction === "reject" && !rejectReason.trim())}
                className={`flex-1 px-4 py-2.5 text-sm font-bold rounded-xl text-white transition disabled:opacity-50 ${
                  modalAction === "approve"
                    ? "bg-emerald-600 hover:bg-emerald-700"
                    : "bg-red-600 hover:bg-red-700"
                }`}
              >
                {actionLoading ? "Memproses..." : modalAction === "approve" ? "Ya, Terima" : "Ya, Tolak"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image Gallery Modal */}
      {previewUrls.length > 0 && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={() => setPreviewUrls([])}
        >
          <div className="relative max-w-2xl max-h-[80vh] flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
            {/* Close button */}
            <button
              onClick={() => setPreviewUrls([])}
              className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-white shadow-lg flex items-center justify-center text-slate-600 hover:text-red-500 transition z-10"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>

            {/* Counter */}
            {previewUrls.length > 1 && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-white shadow-lg rounded-full px-3 py-0.5 text-xs font-bold text-slate-700 z-10">
                {previewIndex + 1} / {previewUrls.length}
              </div>
            )}

            {/* Main image */}
            <img
              src={previewUrls[previewIndex]}
              alt={`Bukti follow ${previewIndex + 1}`}
              className="max-w-full max-h-[70vh] rounded-2xl shadow-2xl object-contain bg-white"
            />

            {/* Navigation arrows */}
            {previewUrls.length > 1 && (
              <>
                <button
                  onClick={(e) => { e.stopPropagation(); setPreviewIndex((i) => (i > 0 ? i - 1 : previewUrls.length - 1)); }}
                  className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 w-10 h-10 rounded-full bg-white/90 shadow-lg flex items-center justify-center text-slate-700 hover:bg-white hover:text-indigo-600 transition"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setPreviewIndex((i) => (i < previewUrls.length - 1 ? i + 1 : 0)); }}
                  className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-10 h-10 rounded-full bg-white/90 shadow-lg flex items-center justify-center text-slate-700 hover:bg-white hover:text-indigo-600 transition"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              </>
            )}

            {/* Thumbnail strip */}
            {previewUrls.length > 1 && (
              <div className="flex gap-2 mt-3">
                {previewUrls.map((url, i) => (
                  <button
                    key={i}
                    onClick={(e) => { e.stopPropagation(); setPreviewIndex(i); }}
                    className={`rounded-lg overflow-hidden border-2 transition ${
                      i === previewIndex ? "border-indigo-500 shadow-md" : "border-white/50 opacity-60 hover:opacity-100"
                    }`}
                  >
                    <img src={url} alt={`Foto ${i + 1}`} className="w-12 h-12 object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
    </DashboardLayout>
  );
}