"use client";

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
    const {
        register,
        handleSubmit,
        formState: { errors },
    } = useForm<CreatePaymentType>({
        resolver:
            zodResolver(createPaymentSchema),

        defaultValues: {
            payment_method: "QRIS",
        },
    });

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

            if (!result.success) {
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
            <Card className="max-w-md mx-auto p-5 rounded-2xl shadow-lg">
                <h1 className="text-2xl font-bold mb-1">
                    Buat Pembayaran
                </h1>

                <p className="text-sm text-slate-500 mb-6">
                    Isi data customer
                </p>

                <form
                    onSubmit={handleSubmit(onSubmit)}
                    className="space-y-4"
                >
                    {/* Nama Customer */}
                    <div>
                        <Input
                            placeholder="Nama Customer"
                            {...register(
                                "customer_name"
                            )}
                        />

                        {errors.customer_name && (
                            <p className="text-red-500 text-sm mt-1">
                                {
                                    errors.customer_name
                                        .message
                                }
                            </p>
                        )}
                    </div>

                    {/* No HP */}
                    <div>
                        <Input
                            type="tel"
                            placeholder="Nomor HP / WhatsApp"
                            {...register(
                                "customer_phone"
                            )}
                        />

                        {errors.customer_phone && (
                            <p className="text-red-500 text-sm mt-1">
                                {
                                    errors.customer_phone
                                        .message
                                }
                            </p>
                        )}
                    </div>

                    {/* Nama Laptop */}
                    <div>
                        <Input
                            placeholder="Nama Laptop"
                            {...register(
                                "laptop_name"
                            )}
                        />

                        {errors.laptop_name && (
                            <p className="text-red-500 text-sm mt-1">
                                {
                                    errors.laptop_name
                                        .message
                                }
                            </p>
                        )}
                    </div>

                    {/* Harga */}
                    <div>
                        <Input
                            type="number"
                            placeholder="Harga"
                            {...register(
                                "amount",
                                {
                                    valueAsNumber: true,
                                }
                            )}
                        />

                        {errors.amount && (
                            <p className="text-red-500 text-sm mt-1">
                                {errors.amount.message}
                            </p>
                        )}
                    </div>

                    {/* Payment Method */}
                    <div>
                        <select
                            {...register(
                                "payment_method"
                            )}
                            className="w-full h-11 rounded-md border border-input bg-background px-3 text-sm"
                        >
                            <option value="QRIS">
                                QRIS
                            </option>

                            <option value="TRANSFER">
                                Transfer Bank
                            </option>

                            <option value="CASH">
                                Cash
                            </option>
                        </select>

                        {errors.payment_method && (
                            <p className="text-red-500 text-sm mt-1">
                                {
                                    errors
                                        .payment_method
                                        .message
                                }
                            </p>
                        )}
                    </div>

                    {/* Catatan */}
                    <div>
                        <Input
                            placeholder="Catatan (Opsional)"
                            {...register("notes")}
                        />
                    </div>

                    <Button
                        type="submit"
                        className="w-full h-12 rounded-xl"
                    >
                        Generate Pembayaran
                    </Button>
                </form>
            </Card>
        </main>
    );
}