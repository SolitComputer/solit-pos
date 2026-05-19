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

import { supabase }
    from "@/services/supabase";

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
        paymentPhoto,
        setPaymentPhoto
    ] = useState<
        File | null
    >(null);

    const [
        laptops,
        setLaptops,
    ] = useState<
        Laptop[]
    >([]);

    const [
        latitude,
        setLatitude
    ] = useState("");

    const [
        longitude,
        setLongitude
    ] = useState("");

    const [
        gpsLoading,
        setGpsLoading
    ] = useState(false);

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
                    "CASH",

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

    const getLocation =
        () => {

            setGpsLoading(
                true
            );

            navigator.geolocation.getCurrentPosition(

                (
                    position
                ) => {

                    setLatitude(
                        String(
                            position.coords.latitude
                        )
                    );

                    setLongitude(
                        String(
                            position.coords.longitude
                        )
                    );

                    setGpsLoading(
                        false
                    );
                },

                () => {

                    alert(
                        "GPS wajib diaktifkan"
                    );

                    setGpsLoading(
                        false
                    );
                },

                {
                    enableHighAccuracy:
                        true,
                }
            );
        };

    const onSubmit = async (
        data: CreatePaymentType
    ) => {

        try {

            // ====================
            // VALIDASI
            // ====================
            if (
                !paymentPhoto
            ) {
                alert(
                    "Foto pembayaran wajib diupload"
                );

                return;
            }

            if (
                !latitude ||
                !longitude
            ) {
                alert(
                    "GPS wajib diambil"
                );

                return;
            }

            // ====================
            // UPLOAD PHOTO
            // ====================
            const fileName =
                `${Date.now()}-${paymentPhoto.name}`;

            const {
                error:
                uploadError,
            } =
                await supabase
                    .storage
                    .from(
                        "payment-proof"
                    )
                    .upload(
                        fileName,
                        paymentPhoto
                    );

            if (
                uploadError
            ) {

                console.log(
                    uploadError
                );

                alert(
                    "Upload foto gagal"
                );

                return;
            }

            // ====================
            // GET PUBLIC URL
            // ====================
            const {
                data:
                imageData,
            } =
                supabase
                    .storage
                    .from(
                        "payment-proof"
                    )
                    .getPublicUrl(
                        fileName
                    );

            // ====================
            // SAVE TRANSACTION
            // ====================
            const response =
                await fetch(
                    "/api/transaction/create",
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
                                    ...data,

                                    payment_photo:
                                        imageData.publicUrl,

                                    latitude,

                                    longitude,
                                }
                            ),
                    }
                );

            const result =
                await response.json();

            console.log(
                "RESULT:",
                result
            );

            if (
                !result.success
            ) {

                alert(
                    result.message
                );

                return;
            }

            window.location.href =
                `/receipt/${result.data.invoice_number}`;

        } catch (
        error
        ) {

            console.log(
                error
            );

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

    const dealPrice =
        watch("amount");

    const other =
        selectedLaptop
            ? (dealPrice || 0) -
            selectedLaptop.selling_price
            : 0;

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
                            </div>

                            <Button
                                type="button"
                                className="w-full"
                                onClick={() => {

                                    if (
                                        !watch(
                                            "customer_name"
                                        )
                                    ) {
                                        alert(
                                            "Isi nama customer dulu"
                                        );

                                        return;
                                    }

                                    setStep(2);
                                }}
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
                                            key={item.id}
                                            value={item.id}
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

                            {selectedLaptop && (
                                <div className="bg-slate-50 rounded-2xl p-4 space-y-3">

                                    <div>
                                        <p className="font-semibold text-lg">
                                            {
                                                selectedLaptop.laptop_name
                                            }
                                        </p>

                                        <p className="text-sm text-slate-500">
                                            SN:
                                            {" "}
                                            {
                                                selectedLaptop.serial_number
                                            }
                                        </p>

                                        <p className="text-sm text-slate-500">
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
                                    </div>

                                    <div className="border-t pt-3">

                                        <div className="flex justify-between text-sm">
                                            <span>
                                                Harga Inventory
                                            </span>

                                            <span className="font-semibold">
                                                Rp
                                                {selectedLaptop.selling_price.toLocaleString(
                                                    "id-ID"
                                                )}
                                            </span>
                                        </div>

                                    </div>

                                    <div>
                                        <label className="text-sm font-medium">
                                            Harga Deal
                                        </label>

                                        <Input
                                            type="number"
                                            placeholder="Masukkan harga deal"
                                            {...register(
                                                "amount",
                                                {
                                                    valueAsNumber: true,
                                                }
                                            )}
                                        />
                                    </div>

                                    <div className="border-t pt-3 flex justify-between">

                                        <span>
                                            Other
                                        </span>

                                        <span
                                            className={`font-bold ${other >= 0
                                                ? "text-green-600"
                                                : "text-red-600"
                                                }`}
                                        >
                                            {other >= 0
                                                ? "+"
                                                : "-"}

                                            Rp
                                            {Math.abs(
                                                other
                                            ).toLocaleString(
                                                "id-ID"
                                            )}
                                        </span>

                                    </div>
                                </div>
                            )}

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
                                    onClick={() => {

                                        if (
                                            !selectedLaptop
                                        ) {
                                            alert(
                                                "Pilih laptop dulu"
                                            );

                                            return;
                                        }

                                        if (
                                            !watch(
                                                "amount"
                                            )
                                        ) {
                                            alert(
                                                "Masukkan harga deal"
                                            );

                                            return;
                                        }

                                        setStep(3);
                                    }}
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




                            <select
                                {...register(
                                    "payment_method"
                                )}
                                className="
                                    w-full
                                    h-11
                                    rounded-md
                                    border
                                    px-3
                                "
                            >
                                <option value="CASH">
                                    Cash
                                </option>

                                <option value="TRANSFER">
                                    Transfer
                                </option>

                                <option value="DP">
                                    DP
                                </option>

                                <option value="CICILAN">
                                    Cicilan
                                </option>

                                <option value="LAINNYA">
                                    Lainnya
                                </option>
                            </select>

                            <div>
                                <label className="text-sm font-medium">
                                    Foto Bukti Pembayaran
                                </label>

                                <input
                                    type="file"
                                    accept="image/*"
                                    className="
            w-full
            border
            rounded-xl
            p-3
            bg-white
        "
                                    onChange={(e) =>
                                        setPaymentPhoto(
                                            e.target
                                                .files?.[0] ||
                                            null
                                        )
                                    }
                                />

                                <p className="text-xs text-slate-500 mt-1">
                                    Wajib upload foto uang /
                                    transfer
                                </p>
                            </div>

                            <div className="border rounded-xl p-4">

                                <div className="flex justify-between items-center">

                                    <div>

                                        <p className="font-medium">
                                            GPS Lokasi
                                        </p>

                                        <p className="text-xs text-slate-500">

                                            {latitude
                                                ? "GPS berhasil diambil"
                                                : "GPS wajib aktif"}

                                        </p>

                                    </div>

                                    <Button
                                        type="button"
                                        onClick={
                                            getLocation
                                        }
                                    >
                                        {gpsLoading
                                            ? "Loading..."
                                            : latitude
                                                ? "Diambil"
                                                : "Ambil GPS"}
                                    </Button>

                                </div>

                            </div>

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
                                    Simpan Transaksi
                                </Button>
                            </div>
                        </>
                    )}
                </form>
            </Card>
        </main>
    );
}