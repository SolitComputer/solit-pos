import { z } from "zod";

export const createPaymentSchema =
  z.object({
    customer_name: z
      .string()
      .min(
        3,
        "Nama customer wajib diisi"
      ),

    company_name:
      z.string().optional(),

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
        "Merk laptop wajib diisi"
      ),

    serial_number:
      z.string().optional(),

    software_request:
      z.string().optional(),

    pickup_method:
      z.string(),

    pickup_date:
      z.string().optional(),

    pickup_time:
      z.string().optional(),

    pickup_location:
      z.string().optional(),

    source_platform:
      z.string().optional(),

    amount: z
      .number({
        error:
          "Harga wajib diisi",
      })
      .min(
        1000,
        "Harga wajib diisi"
      ),

    payment_method:
      z.enum([
        "QRIS",
        "TRANSFER",
        "CASH",
      ]),

    notes:
      z.string().optional(),
  });

export type CreatePaymentType =
  z.infer<
    typeof createPaymentSchema
  >;