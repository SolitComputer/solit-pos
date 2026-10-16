"use client";
import { useEffect, useState } from "react";

type U = { id: string; name: string; role: string };

export default function TargetUserSelect({
  value,
  onChange,
  selectClassName,
  label = "Untuk Karyawan",
}: {
  value: string;
  onChange: (id: string) => void;
  selectClassName: string;
  label?: string;
}) {
  const [users, setUsers] = useState<U[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    fetch("/api/cashflow/users")
      .then((r) => r.json())
      .then((d) => { if (mounted && d.success) setUsers(d.data || []); })
      .catch(() => {})
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  return (
    <div>
      <label className="text-xs font-semibold text-gray-600 mb-1.5 block">
        {label} <span className="text-red-500">*</span>
      </label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={selectClassName}>
        <option value="">{loading ? "Memuat karyawan…" : "— Pilih karyawan —"}</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}{u.role ? ` — ${u.role.replace(/_/g, " ")}` : ""}
          </option>
        ))}
      </select>
    </div>
  );
}