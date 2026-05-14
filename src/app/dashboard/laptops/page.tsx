"use client";

import {
    useEffect,
    useState,
} from "react";

interface Laptop {
    id: string;
    laptop_name: string;
    cpu: string;
    ram: string;
    storage: string;
    selling_price: number;
    qty: number;
    status: string;
}

export default function Page() {
    const [
        laptops,
        setLaptops,
    ] = useState<
        Laptop[]
    >([]);

    useEffect(() => {
        fetchLaptops();
    }, []);

    const fetchLaptops =
        async () => {
            const response =
                await fetch(
                    "/api/laptops"
                );

            const result =
                await response.json();

            setLaptops(
                result.data
            );
        };

    return (
        <main className="min-h-screen bg-slate-100 p-5">

            <div className="max-w-7xl mx-auto">

                <div className="flex justify-between items-center mb-6">

                    <h1 className="text-3xl font-bold">
                        Data Laptop
                    </h1>

                    <a
                        href="/dashboard/laptops/create"
                        className="bg-black text-white px-5 py-3 rounded-2xl"
                    >
                        + Tambah Laptop
                    </a>
                </div>

                <div className="grid gap-4">

                    {laptops.map(
                        (item) => (
                            <div
                                key={
                                    item.id
                                }
                                className="bg-white rounded-3xl p-5 shadow-md"
                            >
                                <div className="flex justify-between">

                                    <div>
                                        <h2 className="font-bold text-lg">
                                            {
                                                item.laptop_name
                                            }
                                        </h2>

                                        <p className="text-slate-500">
                                            {
                                                item.cpu
                                            }
                                            {" | "}
                                            {
                                                item.ram
                                            }
                                            {" | "}
                                            {
                                                item.storage
                                            }
                                        </p>
                                    </div>

                                    <div className="text-right">
                                        <h3 className="font-bold text-green-600">
                                            Rp
                                            {item.selling_price?.toLocaleString(
                                                "id-ID"
                                            )}
                                        </h3>

                                        <p>
                                            Stock:
                                            {
                                                item.qty
                                            }
                                        </p>

                                        <p>
                                            {
                                                item.status
                                            }
                                        </p>

                                        <div className="flex gap-2 mt-3 justify-end">
                                            <a
                                                href={`/dashboard/laptops/edit/${item.id}`}
                                                className="
      bg-black
      text-white
      px-4
      py-2
      rounded-xl
    "
                                            >
                                                Edit
                                            </a>

                                            <button
                                                onClick={async () => {
                                                    const ok =
                                                        confirm(
                                                            "Yakin ingin menghapus laptop?"
                                                        );

                                                    if (!ok)
                                                        return;

                                                    await fetch(
                                                        `/api/laptops/${item.id}`,
                                                        {
                                                            method:
                                                                "DELETE",
                                                        }
                                                    );

                                                    fetchLaptops();
                                                }}
                                                className="
      bg-red-500
      text-white
      px-4
      py-2
      rounded-xl
    "
                                            >
                                                Hapus
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )
                    )}
                </div>
            </div>
        </main>
    );
}