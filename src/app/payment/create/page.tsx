"use client";

import { useEffect, useState } from "react";

import { useForm } from "react-hook-form";

import { zodResolver } from "@hookform/resolvers/zod";

import {
    createPaymentSchema,
    CreatePaymentType,
} from "@/lib/validation";

import { Card } from "@/components/ui/card";

import { Input } from "@/components/ui/input";

import { Button } from "@/components/ui/button";

interface Laptop {
    id: string;
    laptop_name: string;
    cpu: string;
    ram: string;
    storage: string;
    serial_number: string;
    selling_price: number;
}

export default function CreatePaymentPage() {
    const [step, setStep] =
        useState(1);

    const [
        laptops,
        setLaptops,
    ] = useState<
        Laptop[]
    >([]);

    const {
        register,
        handleSubmit,
        watch,
        setValue,
        formState: {
            errors,
        },
    } =
        useForm<CreatePaymentType>({
            resolver:
                zodResolver(
                    createPaymentSchema
                ),

            defaultValues: {
                company_name:
                    "Solit 03",

                payment_method:
                    "QRIS",

                pickup_method:
                    "DATANG",


                source_platform:
                    "Instagram",
            },
        });

    const pickupMethod =
        watch(
            "pickup_method"
        );

    const selectedLaptopId =
        watch(
            "laptop_id"
        );

    const selectedLaptop =
        laptops.find(
            (item) =>
                item.id ===
                selectedLaptopId
        );

    useEffect(() => {
        if (!selectedLaptop)
            return;

        setValue(
            "laptop_name",
            selectedLaptop.laptop_name
        );

        setValue(
            "serial_number",
            selectedLaptop.serial_number
        );
    }, [
        selectedLaptop,
        setValue,
    ]);

    const onSubmit = async (
        data: CreatePaymentType
    ) => {
        try {
            const response =
                await fetch(
                    "/api/transaction/create",
                    {
                        method: "POST",

                        headers: {
                            "Content-Type":
                                "application/json",
                        },

                        body: JSON.stringify(
                            data
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

            window.location.href =
                `/payment/${result.data.invoice_number}`;
        } catch (error) {
            console.log(error);

            alert(
                "Terjadi kesalahan"
            );
        }
    };

    useEffect(() => {
        fetchLaptops();
    }, []);

    const fetchLaptops =
        async () => {
            const response =
                await fetch(
                    "/api/laptops/ready"
                );

            const result =
                await response.json();

            setLaptops(
                result.data
            );
        };

    return (
        <main className="min-h-screen bg-slate-100 p-4">
            <Card className="max-w-md mx-auto p-5 rounded-3xl shadow-xl">

                <h1 className="text-2xl font-bold">
                    Solit POS
                </h1>

                <p className="text-slate-500 text-sm mb-6">
                    Format Pemesanan
                    Laptop
                </p>

                {/* STEP INDICATOR */}
                <div className="flex gap-2 mb-6">
                    {[1, 2, 3, 4].map(
                        (item) => (
                            <div
                                key={item}
                                className={`h-2 flex-1 rounded-full ${step >= item
                                    ? "bg-black"
                                    : "bg-slate-200"
                                    }`}
                            />
                        )
                    )}
                </div>

                <form
                    onSubmit={handleSubmit(
                        onSubmit
                    )}
                    className="space-y-4"
                >

                    {/* STEP 1 */}
                    {step === 1 && (
                        <>
                            <Input
                                placeholder="Atas Nama"
                                {...register(
                                    "customer_name"
                                )}
                            />

                            <div>
                                <label className="text-sm font-medium">
                                    Perusahaan
                                </label>

                                <Input
                                    placeholder="Nama perusahaan"
                                    {...register(
                                        "company_name"
                                    )}
                                />

                                {errors.company_name && (
                                    <p className="text-red-500 text-sm mt-1">
                                        {
                                            errors
                                                .company_name
                                                .message
                                        }
                                    </p>
                                )}
                            </div>

                            <Input
                                placeholder="WhatsApp"
                                {...register(
                                    "customer_phone"
                                )}
                            />

                            <div>
                                <label className="text-sm font-medium">
                                    Tahu Solit dari Mana?
                                </label>

                                <select
                                    {...register(
                                        "source_platform"
                                    )}
                                    className="
      w-full
      border
      rounded-xl
      h-12
      px-3
      bg-white
    "
                                >
                                    <option value="Instagram">
                                        Instagram
                                    </option>

                                    <option value="TikTok">
                                        TikTok
                                    </option>

                                    <option value="Facebook">
                                        Facebook
                                    </option>

                                    <option value="WhatsApp">
                                        WhatsApp
                                    </option>

                                    <option value="Google">
                                        Google
                                    </option>

                                    <option value="Shopee">
                                        Shopee
                                    </option>

                                    <option value="Tokopedia">
                                        Tokopedia
                                    </option>

                                    <option value="Teman">
                                        Teman
                                    </option>

                                    <option value="Lainnya">
                                        Lainnya
                                    </option>
                                </select>

                                {selectedLaptop && (
                                    <div className="bg-slate-50 rounded-2xl p-4">

                                        <p>
                                            <strong>
                                                Laptop:
                                            </strong>{" "}
                                            {
                                                selectedLaptop.laptop_name
                                            }
                                        </p>

                                        <p>
                                            <strong>
                                                SN:
                                            </strong>{" "}
                                            {
                                                selectedLaptop.serial_number
                                            }
                                        </p>

                                        <p>
                                            <strong>
                                                Spek:
                                            </strong>{" "}
                                            {
                                                selectedLaptop.cpu
                                            }
                                            {" | "}
                                            {
                                                selectedLaptop.ram
                                            }
                                            {" | "}
                                            {
                                                selectedLaptop.storage
                                            }
                                        </p>

                                        <p className="font-bold text-green-600 mt-2">
                                            Rp
                                            {selectedLaptop.selling_price.toLocaleString(
                                                "id-ID"
                                            )}
                                        </p>
                                    </div>
                                )}
                            </div>

                            <Button
                                type="button"
                                className="w-full"
                                onClick={() =>
                                    setStep(2)
                                }
                            >
                                Lanjut
                            </Button>
                        </>
                    )}

                    {/* STEP 2 */}
                    {step === 2 && (
                        <>
                            <select
                                {...register(
                                    "laptop_id"
                                )}
                                className="
    w-full
    h-12
    border
    rounded-xl
    px-3
    bg-white
  "
                            >
                                <option value="">
                                    Pilih Laptop
                                </option>

                                {laptops.map(
                                    (item) => (
                                        <option
                                            key={
                                                item.id
                                            }
                                            value={
                                                item.id
                                            }
                                        >
                                            {
                                                item.laptop_name
                                            }
                                            {" | "}
                                            {item.cpu}
                                            {" | "}
                                            {item.ram}
                                            {" | "}
                                            {
                                                item.storage
                                            }
                                            {" | Rp"}
                                            {item.selling_price.toLocaleString(
                                                "id-ID"
                                            )}
                                        </option>
                                    )
                                )}
                            </select>

                            {selectedLaptop && (
                                <div className="bg-slate-50 rounded-2xl p-4">

                                    <p>
                                        <strong>
                                            Laptop:
                                        </strong>{" "}
                                        {
                                            selectedLaptop.laptop_name
                                        }
                                    </p>

                                    <p>
                                        <strong>
                                            SN:
                                        </strong>{" "}
                                        {
                                            selectedLaptop.serial_number
                                        }
                                    </p>

                                    <p>
                                        <strong>
                                            Spek:
                                        </strong>{" "}
                                        {
                                            selectedLaptop.cpu
                                        }
                                        {" | "}
                                        {
                                            selectedLaptop.ram
                                        }
                                        {" | "}
                                        {
                                            selectedLaptop.storage
                                        }
                                    </p>

                                    <p className="font-bold text-green-600 mt-2">
                                        Rp
                                        {selectedLaptop.selling_price.toLocaleString(
                                            "id-ID"
                                        )}
                                    </p>
                                </div>
                            )}

                            <input
                                type="hidden"
                                {...register(
                                    "laptop_name"
                                )}
                            />

                            <input
                                type="hidden"
                                {...register(
                                    "serial_number"
                                )}
                            />

                            <Input
                                placeholder="Request Software"
                                {...register(
                                    "software_request"
                                )}
                            />

                            <div className="flex gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="flex-1"
                                    onClick={() =>
                                        setStep(1)
                                    }
                                >
                                    Kembali
                                </Button>

                                <Button
                                    type="button"
                                    className="flex-1"
                                    onClick={() =>
                                        setStep(3)
                                    }
                                >
                                    Lanjut
                                </Button>
                            </div>
                        </>
                    )}

                    {/* STEP 3 */}
                    {step === 3 && (
                        <>
                            <select
                                {...register(
                                    "pickup_method"
                                )}
                                className="w-full h-11 rounded-md border px-3"
                            >
                                <option value="DATANG">
                                    Datang ke toko
                                </option>

                                <option value="DIANTAR">
                                    Diantar
                                </option>
                            </select>

                            <Input
                                type="date"
                                {...register(
                                    "pickup_date"
                                )}
                            />

                            <Input
                                type="time"
                                {...register(
                                    "pickup_time"
                                )}
                            />

                            {pickupMethod ===
                                "DIANTAR" && (
                                    <Input
                                        placeholder="Lokasi Antar"
                                        {...register(
                                            "pickup_location"
                                        )}
                                    />
                                )}

                            <div className="flex gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="flex-1"
                                    onClick={() =>
                                        setStep(2)
                                    }
                                >
                                    Kembali
                                </Button>

                                <Button
                                    type="button"
                                    className="flex-1"
                                    onClick={() =>
                                        setStep(4)
                                    }
                                >
                                    Lanjut
                                </Button>
                            </div>
                        </>
                    )}

                    {/* STEP 4 */}
                    {step === 4 && (
                        <>
                            <Input
                                type="number"
                                placeholder="Harga Deal"
                                {...register(
                                    "amount",
                                    {
                                        valueAsNumber: true,
                                    }
                                )}
                            />
                            <select
                                {...register(
                                    "payment_method"
                                )}
                                className="w-full h-11 rounded-md border px-3"
                            >
                                <option value="QRIS">
                                    QRIS
                                </option>

                                <option value="TRANSFER">
                                    Transfer
                                </option>

                                <option value="CASH">
                                    Cash
                                </option>
                            </select>

                            <Input
                                placeholder="Catatan"
                                {...register(
                                    "notes"
                                )}
                            />

                            <div className="flex gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="flex-1"
                                    onClick={() =>
                                        setStep(3)
                                    }
                                >
                                    Kembali
                                </Button>

                                <Button
                                    type="submit"
                                    className="flex-1"
                                >
                                    Generate QRIS
                                </Button>
                            </div>
                        </>
                    )}
                </form>
            </Card>
        </main>
    );
}