"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  useParams,
  useRouter,
} from "next/navigation";

import { Input }
from "@/components/ui/input";

import { Button }
from "@/components/ui/button";

import { Card }
from "@/components/ui/card";

export default function Page() {
  const router =
    useRouter();

  const params =
    useParams();

  const id =
    params.id;

  const [
    form,
    setForm,
  ] = useState<any>(
    null
  );

  useEffect(() => {
    fetchLaptop();
  }, []);

  const fetchLaptop =
    async () => {
      const response =
        await fetch(
          `/api/laptops/${id}`
        );

      const result =
        await response.json();

      setForm(
        result.data
      );
    };

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

      const response =
        await fetch(
          `/api/laptops/${id}`,
          {
            method:
              "PUT",

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
        "Laptop berhasil diupdate"
      );

      router.push(
        "/dashboard/laptops"
      );
    };

  if (!form)
    return (
      <div>
        Loading...
      </div>
    );

  return (
    <main className="min-h-screen bg-slate-100 p-5">

      <Card className="max-w-3xl mx-auto p-6 rounded-3xl">

        <h1 className="text-3xl font-bold mb-5">
          Edit Laptop
        </h1>

        <form
          onSubmit={
            handleSubmit
          }
          className="grid md:grid-cols-2 gap-4"
        >

          <Input
            name="laptop_name"
            value={
              form.laptop_name
            }
            onChange={
              handleChange
            }
          />

          <Input
            name="cpu"
            value={
              form.cpu
            }
            onChange={
              handleChange
            }
          />

          <Input
            name="ram"
            value={
              form.ram
            }
            onChange={
              handleChange
            }
          />

          <Input
            name="storage"
            value={
              form.storage
            }
            onChange={
              handleChange
            }
          />

          <Input
            name="selling_price"
            value={
              form.selling_price
            }
            onChange={
              handleChange
            }
          />

          <Input
            name="qty"
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
            className="h-11 border rounded-xl px-3"
          >
            <option value="SIAP_JUAL">
              SIAP JUAL
            </option>

            <option value="BELUM_SIAP">
              BELUM SIAP
            </option>

            <option value="SERVICE">
              SERVICE
            </option>
          </select>

          <div className="md:col-span-2">

            <Button className="w-full">
              Simpan
            </Button>
          </div>
        </form>
      </Card>
    </main>
  );
}