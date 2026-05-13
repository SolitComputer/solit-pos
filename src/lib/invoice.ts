export function generateInvoice() {
  const now = new Date();

  const year = now.getFullYear();

  const month = String(
    now.getMonth() + 1
  ).padStart(2, "0");

  const day = String(
    now.getDate()
  ).padStart(2, "0");

  const random = Math.floor(
    100 + Math.random() * 900
  );

  return `INV-${year}${month}${day}-${random}`;
}