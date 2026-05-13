import { z } from "zod";

export const createPaymentSchema =
  z.object({
    customer_name: z
      .string()
      .min(
        3,
        "Nama customer wajib diisi"
      ),

    customer_phone: z
      .string()
      .min(
        10,
        "Nomor HP tidak valid"
      ),

    laptop_name: z
      .string()
      .min(
        3,
        "Nama laptop wajib diisi"
      ),

    amount: z
      .number({
        error: "Harga wajib diisi",
      })
      .min(
        1000,
        "Harga minimal Rp1.000"
      ),

    payment_method: z.enum([
      "QRIS",
      "TRANSFER",
      "CASH",
    ]),

    notes: z.string().optional(),
  });

export type CreatePaymentType =
  z.infer<
    typeof createPaymentSchema
  >;