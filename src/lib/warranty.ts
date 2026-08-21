// src/lib/warranty.ts
// Logika hitung status garansi dari tanggal — dipakai bareng di route list
// (GET /api/warranty) dan route edit (PUT /api/warranty/[id]) supaya kedua
// tempat itu selalu sepakat soal "status hasil auto-hitung dari tanggal".

export type WarrantyStatus = "ACTIVE" | "EXPIRING_SOON" | "EXPIRED" | "VOID";

export function computeWarrantyStatus(
  warrantyEnd: string,
  storedStatus: string
): { computedStatus: WarrantyStatus; daysLeft: number } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(warrantyEnd);
  end.setHours(0, 0, 0, 0);
  const daysLeft = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (storedStatus === "VOID") {
    return { computedStatus: "VOID", daysLeft };
  }

  let computedStatus: WarrantyStatus;
  if (daysLeft < 0) computedStatus = "EXPIRED";
  else if (daysLeft <= 7) computedStatus = "EXPIRING_SOON";
  else computedStatus = "ACTIVE";

  return { computedStatus, daysLeft };
}
