// src/lib/validation.ts

import { z } from "zod";

export const createPaymentSchema = z.object({
    customer_name: z
        .string()
        .min(3, "Nama customer wajib diisi"),

    customer_type: z.enum(["UMUM", "RESELLER", "MITRA"]),

    company_name: z
        .string()
        .optional(),

    customer_phone: z
        .string()
        .min(10, "Nomor HP tidak valid"),

    laptop_id: z
        .string()
        .min(1, "Laptop wajib dipilih"),

    laptop_name: z
        .string(),
        
    unit_id: z
        .string(),

    serial_number: z
        .string(),

    software_request: z
        .string()
        .optional(),

    pickup_method: z
        .string(),

    pickup_date: z
        .string()
        .min(1, "Tanggal wajib diisi"),

    pickup_time: z
        .string()
        .min(1, "Jam wajib diisi"),

    pickup_location: z
        .string()
        .optional(),

    source_platform: z
        .string()
        .min(1, "Pilih sumber customer"),

    amount: z
        .number({
            error: "Harga wajib diisi",
        })
        .min(1000, "Harga minimal Rp1.000"),

    payment_method: z
        .enum(["QRIS", "TRANSFER", "CASH"]),

    notes: z
        .string()
        .optional(),
}).superRefine((data, ctx) => {
    if (data.pickup_method === "DIANTAR" && !data.pickup_location) {
        ctx.addIssue({
            code: "custom",
            path: ["pickup_location"],
            message: "Lokasi antar wajib diisi",
        });
    }
});

export type CreatePaymentType = z.infer<typeof createPaymentSchema>;