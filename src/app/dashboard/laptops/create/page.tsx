"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Page() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    laptop_name: "",
    brand: "",
    cpu: "",
    ram: "",
    storage: "",
    gpu: "",
    display: "",
    serial_number: "",
    purchase_price: "",
    selling_price: "",
    qty: 1,
    status: "SIAP_JUAL",
    condition_note: "",
    notes: "",
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    setForm({
      ...form,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      const response = await fetch("/api/laptops/create", {
        method: "POST",
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
      alert("Laptop berhasil ditambahkan");
      router.push("/dashboard/laptops");
    } catch (error) {
      console.log(error);
      alert("Terjadi kesalahan");
    } finally {
      setLoading(false);
    }
  };

  // Skeleton Form (sama persis layoutnya dengan form asli)
  const FormSkeleton = () => (
    <div className="grid md:grid-cols-2 gap-4 animate-pulse">
      {Array(14)
        .fill(0)
        .map((_, i) => (
          <div key={i} className="h-11 bg-gray-100 rounded-xl"></div>
        ))}
      <div className="md:col-span-2 h-11 bg-gray-100 rounded-xl"></div>
    </div>
  );

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-3xl mx-auto">
        <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
          <h1 className="text-2xl font-semibold text-gray-800 tracking-tight mb-6">
            Tambah Laptop
          </h1>

          {loading ? (
            <FormSkeleton />
          ) : (
            <form onSubmit={handleSubmit} className="grid md:grid-cols-2 gap-4">
              <input
                type="text"
                name="laptop_name"
                placeholder="Nama Laptop"
                onChange={handleChange}
                className="border border-gray-200 rounded-xl h-11 px-4 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300 transition bg-gray-50/50"
              />
              <input
                type="text"
                name="brand"
                placeholder="Brand"
                onChange={handleChange}
                className="border border-gray-200 rounded-xl h-11 px-4 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300 transition bg-gray-50/50"
              />
              <input
                type="text"
                name="cpu"
                placeholder="CPU"
                onChange={handleChange}
                className="border border-gray-200 rounded-xl h-11 px-4 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300 transition bg-gray-50/50"
              />
              <input
                type="text"
                name="ram"
                placeholder="RAM"
                onChange={handleChange}
                className="border border-gray-200 rounded-xl h-11 px-4 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300 transition bg-gray-50/50"
              />
              <input
                type="text"
                name="storage"
                placeholder="Storage"
                onChange={handleChange}
                className="border border-gray-200 rounded-xl h-11 px-4 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300 transition bg-gray-50/50"
              />
              <input
                type="text"
                name="gpu"
                placeholder="GPU"
                onChange={handleChange}
                className="border border-gray-200 rounded-xl h-11 px-4 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300 transition bg-gray-50/50"
              />
              <input
                type="text"
                name="display"
                placeholder="Display"
                onChange={handleChange}
                className="border border-gray-200 rounded-xl h-11 px-4 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300 transition bg-gray-50/50"
              />
              <input
                type="text"
                name="serial_number"
                placeholder="Serial Number"
                onChange={handleChange}
                className="border border-gray-200 rounded-xl h-11 px-4 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300 transition bg-gray-50/50"
              />
              <input
                type="number"
                name="purchase_price"
                placeholder="Harga Modal"
                onChange={handleChange}
                className="border border-gray-200 rounded-xl h-11 px-4 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300 transition bg-gray-50/50"
              />
              <input
                type="number"
                name="selling_price"
                placeholder="Harga Jual"
                onChange={handleChange}
                className="border border-gray-200 rounded-xl h-11 px-4 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300 transition bg-gray-50/50"
              />
              <input
                type="number"
                name="qty"
                placeholder="Stock"
                value={form.qty}
                onChange={handleChange}
                className="border border-gray-200 rounded-xl h-11 px-4 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300 transition bg-gray-50/50"
              />
              <select
                name="status"
                value={form.status}
                onChange={handleChange}
                className="border border-gray-200 rounded-xl h-11 px-4 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300 bg-gray-50/50"
              >
                <option value="SIAP_JUAL">Siap Jual</option>
                <option value="BELUM_SIAP">Belum Siap</option>
                <option value="SERVICE">Service</option>
              </select>
              <input
                type="text"
                name="condition_note"
                placeholder="Kondisi"
                onChange={handleChange}
                className="border border-gray-200 rounded-xl h-11 px-4 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300 transition bg-gray-50/50"
              />
              <input
                type="text"
                name="notes"
                placeholder="Catatan"
                onChange={handleChange}
                className="border border-gray-200 rounded-xl h-11 px-4 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300 transition bg-gray-50/50"
              />

              <div className="md:col-span-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-white text-gray-700 border border-gray-200 rounded-xl h-11 font-medium hover:bg-gray-50 transition shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? "Menyimpan..." : "Tambah Laptop"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}