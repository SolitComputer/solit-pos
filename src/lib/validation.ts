import { z } from "zod";

export const PAYMENT_METHODS = [
  "QRIS", "TRANSFER", "CASH",
  "TF_CASH",
  "SHOPEE_PAY", "TOKOPEDIA_PAY", "COD",
] as const;

export type PaymentMethod = typeof PAYMENT_METHODS[number];

export type UnitItem = {
  unit_id: string;
  laptop_id: string;
  serial_number: string;
  laptop_name: string;
  grade?: string;
  selling_price: number;
};

export const unitItemSchema = z.object({
  unit_id: z.string().min(1),
  laptop_id: z.string().min(1),
  serial_number: z.string().min(1),
  laptop_name: z.string().min(1),
  grade: z.string().optional(),
  selling_price: z.number().default(0),
});

export const createPaymentSchema = z.object({
  customer_name: z.string().min(3, "Nama customer wajib diisi"),
  customer_type: z.enum(["UMUM", "RESELLER", "MITRA"]),
  seller_type: z.enum(["USER", "PEDAGANG"]).default("USER"),
  company_name: z.string().optional(),
  customer_phone: z.string().min(10, "Nomor HP tidak valid"),

  units: z.array(unitItemSchema).min(1, "Minimal 1 unit harus dipilih"),

  laptop_id: z.string().default(""),
  laptop_name: z.string().default(""),
  unit_id: z.string().default(""),
  serial_number: z.string().default(""),

  software_request: z.string().optional(),
  pickup_method: z.string(),
  pickup_date: z.string().min(1, "Tanggal wajib diisi"),
  pickup_time: z.string().min(1, "Jam wajib diisi"),
  pickup_location: z.string().optional(),
  source_platform: z.string().min(1, "Pilih sumber customer"),

  amount: z.number().min(0).default(0),

  payment_method: z.enum(PAYMENT_METHODS),

  amount_method_1: z.number().default(0),
  amount_method_2: z.number().default(0),
  payment_method_2: z.string().optional(),

  // Trade-in
  is_trade_in: z.boolean().default(false),
  trade_in_item: z.string().optional(),
  trade_in_value: z.number().default(0),
  trade_in_cash: z.number().default(0),

  notes: z.string().optional(),
  is_ecommerce: z.boolean().optional(),
  ecommerce_platform: z.enum(["SHOPEE", "TOKOPEDIA", "TIKTOK", "LAZADA", ""]).optional(),
  ecommerce_order_id: z.string().optional(),
}).superRefine((data, ctx) => {
  // Hanya validasi pickup_location dan ecommerce_platform
  if (data.pickup_method === "DIANTAR" && !data.pickup_location) {
    ctx.addIssue({
      code: "custom",
      path: ["pickup_location"],
      message: "Lokasi antar wajib diisi",
    });
  }
  if (data.is_ecommerce && !data.ecommerce_platform) {
    ctx.addIssue({
      code: "custom",
      path: ["ecommerce_platform"],
      message: "Pilih platform e-commerce",
    });
  }
  // Trade-in validasi
  if (data.is_trade_in) {
    if (!data.trade_in_item) {
      ctx.addIssue({
        code: "custom",
        path: ["trade_in_item"],
        message: "Nama barang tukar wajib diisi",
      });
    }
    if (!data.trade_in_value || data.trade_in_value <= 0) {
      ctx.addIssue({
        code: "custom",
        path: ["trade_in_value"],
        message: "Nilai barang tukar wajib diisi",
      });
    }
  }
});

export type CreatePaymentType = z.infer<typeof createPaymentSchema>;