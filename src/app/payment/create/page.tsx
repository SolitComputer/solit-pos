"use client";

import { useState } from "react";

import { useForm } from "react-hook-form";

import { zodResolver } from "@hookform/resolvers/zod";

import {
    createPaymentSchema,
    CreatePaymentType,
} from "@/lib/validation";

import { Card } from "@/components/ui/card";

import { Input } from "@/components/ui/input";

import { Button } from "@/components/ui/button";

export default function CreatePaymentPage() {
    const [step, setStep] =
        useState(1);

    const {
        register,
        handleSubmit,
        watch,
    } =
        useForm<CreatePaymentType>({
            resolver:
                zodResolver(
                    createPaymentSchema
                ),

            defaultValues: {
                payment_method:
                    "QRIS",

                pickup_method:
                    "DATANG",
            },
        });

    const pickupMethod =
        watch(
            "pickup_method"
        );

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

                            <Input
                                placeholder="Perusahaan (Opsional)"
                                {...register(
                                    "company_name"
                                )}
                            />

                            <Input
                                placeholder="WhatsApp"
                                {...register(
                                    "customer_phone"
                                )}
                            />

                            <Input
                                placeholder="Tahu Solit dari mana?"
                                {...register(
                                    "source_platform"
                                )}
                            />

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
                            <Input
                                placeholder="Merk Laptop"
                                {...register(
                                    "laptop_name"
                                )}
                            />

                            <Input
                                placeholder="Serial Number"
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