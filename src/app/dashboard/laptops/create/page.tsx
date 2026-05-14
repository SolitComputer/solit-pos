"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

import { Card }
from "@/components/ui/card";

import { Input }
from "@/components/ui/input";

import { Button }
from "@/components/ui/button";

export default function Page() {
  const router =
    useRouter();

  const [loading,
    setLoading] =
    useState(false);

  const [form,
    setForm] =
    useState({
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
      status:
        "SIAP_JUAL",
      condition_note:
        "",
      notes: "",
    });

  const handleChange =
    (
      e:
        React.ChangeEvent<
          HTMLInputElement |
          HTMLSelectElement
        >
    ) => {
      setForm({
        ...form,

        [
          e.target.name
        ]:
          e.target.value,
      });
    };

  const handleSubmit =
    async (
      e:
        React.FormEvent
    ) => {
      e.preventDefault();

      try {
        setLoading(true);

        const response =
          await fetch(
            "/api/laptops/create",
            {
              method:
                "POST",

              headers:
                {
                  "Content-Type":
                    "application/json",
                },

              body:
                JSON.stringify(
                  {
                    ...form,

                    purchase_price:
                      Number(
                        form.purchase_price
                      ),

                    selling_price:
                      Number(
                        form.selling_price
                      ),

                    qty:
                      Number(
                        form.qty
                      ),
                  }
                ),
            }
          );

        const result =
          await response.json();

        if (
          !result.success
        ) {
          alert(
            result.message
          );

          return;
        }

        alert(
          "Laptop berhasil ditambahkan"
        );

        router.push(
          "/dashboard/laptops"
        );
      } catch (
        error
      ) {
        console.log(
          error
        );

        alert(
          "Terjadi kesalahan"
        );
      } finally {
        setLoading(
          false
        );
      }
    };

  return (
    <main className="min-h-screen bg-slate-100 p-5">

      <Card className="max-w-3xl mx-auto p-6 rounded-3xl shadow-lg">

        <h1 className="text-3xl font-bold mb-6">
          Tambah Laptop
        </h1>

        <form
          onSubmit={
            handleSubmit
          }
          className="grid md:grid-cols-2 gap-4"
        >

          <Input
            name="laptop_name"
            placeholder="Nama Laptop"
            onChange={
              handleChange
            }
          />

          <Input
            name="brand"
            placeholder="Brand"
            onChange={
              handleChange
            }
          />

          <Input
            name="cpu"
            placeholder="CPU"
            onChange={
              handleChange
            }
          />

          <Input
            name="ram"
            placeholder="RAM"
            onChange={
              handleChange
            }
          />

          <Input
            name="storage"
            placeholder="Storage"
            onChange={
              handleChange
            }
          />

          <Input
            name="gpu"
            placeholder="GPU"
            onChange={
              handleChange
            }
          />

          <Input
            name="display"
            placeholder="Display"
            onChange={
              handleChange
            }
          />

          <Input
            name="serial_number"
            placeholder="Serial Number"
            onChange={
              handleChange
            }
          />

          <Input
            type="number"
            name="purchase_price"
            placeholder="Harga Modal"
            onChange={
              handleChange
            }
          />

          <Input
            type="number"
            name="selling_price"
            placeholder="Harga Jual"
            onChange={
              handleChange
            }
          />

          <Input
            type="number"
            name="qty"
            placeholder="Stock"
            value={
              form.qty
            }
            onChange={
              handleChange
            }
          />

          <select
            name="status"
            value={
              form.status
            }
            onChange={
              handleChange
            }
            className="
              h-11
              rounded-xl
              border
              px-3
              bg-white
            "
          >
            <option value="SIAP_JUAL">
              Siap Jual
            </option>

            <option value="BELUM_SIAP">
              Belum Siap
            </option>

            <option value="SERVICE">
              Service
            </option>
          </select>

          <Input
            name="condition_note"
            placeholder="Kondisi"
            onChange={
              handleChange
            }
          />

          <Input
            name="notes"
            placeholder="Catatan"
            onChange={
              handleChange
            }
          />

          <div className="md:col-span-2">

            <Button
              type="submit"
              className="w-full h-12 rounded-2xl"
              disabled={
                loading
              }
            >
              {loading
                ? "Menyimpan..."
                : "Tambah Laptop"}
            </Button>
          </div>
        </form>
      </Card>
    </main>
  );
}