"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

export default function Page() {
  const router = useRouter();
  const params = useParams();
  const id = params.id;
  const [form, setForm] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchLaptop();
  }, []);

  const fetchLaptop = async () => {
    try {
      const response = await fetch(`/api/laptops/${id}`);
      const result = await response.json();
      setForm(result.data);
    } catch (error) {
      console.error(error);
      alert("Gagal memuat data laptop");
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/laptops/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          purchase_price: Number(form.purchase_price),
          selling_price: Number(form.selling_price),
          qty: Number(form.qty),
        }),
      });
      const result = await response.json();
      if (!result.success) {
        alert(result.message);
        return;
      }
      alert("Laptop berhasil diupdate");
      router.push("/dashboard/laptops");
    } catch (error) {
      console.error(error);
      alert("Terjadi kesalahan");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Skeleton form edit
  if (isLoading) {
    return (
      <main className="min-h-screen bg-gray-50 p-4 md:p-6">
        <div className="max-w-3xl mx-auto">
          <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm animate-pulse">
            <div className="h-6 bg-gray-100 rounded w-32 mb-6"></div>
            <div className="grid md:grid-cols-2 gap-4">
              {Array(7)
                .fill(0)
                .map((_, i) => (
                  <div key={i} className="h-10 bg-gray-100 rounded-lg"></div>
                ))}
              <div className="md:col-span-2 h-10 bg-gray-100 rounded-lg"></div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="max-w-3xl mx-auto">
        <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm">
          <h1 className="text-xl md:text-2xl font-semibold text-gray-800 tracking-tight mb-6">
            Edit Laptop
          </h1>

          <form onSubmit={handleSubmit} className="grid md:grid-cols-2 gap-4">
            <input
              type="text"
              name="laptop_name"
              placeholder="Nama Laptop"
              value={form?.laptop_name || ""}
              onChange={handleChange}
              className="border border-gray-200 rounded-lg h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300 bg-gray-50/50"
              required
            />
            <input
              type="text"
              name="cpu"
              placeholder="CPU"
              value={form?.cpu || ""}
              onChange={handleChange}
              className="border border-gray-200 rounded-lg h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300 bg-gray-50/50"
            />
            <input
              type="text"
              name="ram"
              placeholder="RAM"
              value={form?.ram || ""}
              onChange={handleChange}
              className="border border-gray-200 rounded-lg h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300 bg-gray-50/50"
            />
            <input
              type="text"
              name="storage"
              placeholder="Storage"
              value={form?.storage || ""}
              onChange={handleChange}
              className="border border-gray-200 rounded-lg h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300 bg-gray-50/50"
            />
            <input
              type="number"
              name="purchase_price"
              placeholder="Harga Modal"
              value={form?.purchase_price || ""}
              onChange={handleChange}
              className="border border-gray-200 rounded-lg h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300 bg-gray-50/50"
            />
            <input
              type="number"
              name="selling_price"
              placeholder="Harga Jual"
              value={form?.selling_price || ""}
              onChange={handleChange}
              className="border border-gray-200 rounded-lg h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300 bg-gray-50/50"
              required
            />
            <input
              type="number"
              name="qty"
              placeholder="Stock"
              value={form?.qty || 0}
              onChange={handleChange}
              className="border border-gray-200 rounded-lg h-10 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300 bg-gray-50/50"
              required
            />
            <select
              name="status"
              value={form?.status || "SIAP_JUAL"}
              onChange={handleChange}
              className="border border-gray-200 rounded-lg h-10 px-3 text-sm bg-gray-50/50 focus:outline-none focus:ring-1 focus:ring-gray-300"
            >
              <option value="SIAP_JUAL">Siap Jual</option>
              <option value="BELUM_SIAP">Belum Siap</option>
              <option value="SERVICE">Service</option>
            </select>

            <div className="md:col-span-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-white text-gray-700 border border-gray-200 rounded-lg h-10 font-medium hover:bg-gray-50 transition shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? "Menyimpan..." : "Simpan Perubahan"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}