/**
 * Utility untuk menambahkan watermark timestamp (Hari, Tanggal, Jam, Menit, Detik WIB)
 * pada foto bukti lembur atau foto verifikasi lainnya.
 */

const DAYS = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const MONTHS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember"
];

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export interface WatermarkOptions {
  customDate?: Date;
  tag?: string;
  subTag?: string;
}

export interface WatermarkResult {
  file: File;
  blob: Blob;
  dataUrl: string;
  timestampText: string;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(new Error("Gagal memuat gambar untuk watermark"));
    img.src = src;
  });
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  if (typeof ctx.roundRect === "function") {
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
  } else {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }
}

/**
 * Menambahkan watermark tanggal, hari, waktu (jam, menit, detik WIB) ke gambar.
 * Menerima File, Blob, Image Data URL/URL, atau HTMLCanvasElement.
 */
export async function addTimestampWatermark(
  source: File | Blob | string | HTMLCanvasElement,
  options: WatermarkOptions = {}
): Promise<WatermarkResult> {
  // 1. Dapatkan objek Date dalam zona waktu Asia/Jakarta (WIB)
  const now = options.customDate ?? new Date();
  const wibTime = new Date(now.getTime() + (now.getTimezoneOffset() + 420) * 60 * 1000);

  const dayName = DAYS[wibTime.getDay()];
  const dateNum = wibTime.getDate();
  const monthName = MONTHS[wibTime.getMonth()];
  const yearNum = wibTime.getFullYear();
  const hours = pad2(wibTime.getHours());
  const minutes = pad2(wibTime.getMinutes());
  const seconds = pad2(wibTime.getSeconds());

  const dateStr = `${dayName}, ${dateNum} ${monthName} ${yearNum}`;
  const timeStr = `${hours}:${minutes}:${seconds} WIB`;
  const tagStr = options.tag ?? "SOLIT POS • BUKTI LEMBUR";
  const subTagStr = options.subTag;

  // 2. Siapkan canvas & load source image
  let canvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D;

  if (typeof HTMLCanvasElement !== "undefined" && source instanceof HTMLCanvasElement) {
    canvas = document.createElement("canvas");
    canvas.width = source.width;
    canvas.height = source.height;
    ctx = canvas.getContext("2d")!;
    ctx.drawImage(source, 0, 0);
  } else {
    let srcUrl = "";
    let shouldRevoke = false;

    if (typeof source === "string") {
      srcUrl = source;
    } else {
      srcUrl = URL.createObjectURL(source as Blob);
      shouldRevoke = true;
    }

    try {
      const img = await loadImage(srcUrl);
      canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth || img.width || 1280;
      canvas.height = img.naturalHeight || img.height || 720;
      ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    } finally {
      if (shouldRevoke) {
        URL.revokeObjectURL(srcUrl);
      }
    }
  }

  // 3. Render watermark badge
  const minDim = Math.min(canvas.width, canvas.height);
  const fontSize = Math.max(14, Math.min(46, Math.round(minDim / 26)));
  const smallFontSize = Math.max(10, Math.round(fontSize * 0.72));
  const pad = Math.round(fontSize * 0.65);
  const margin = Math.round(fontSize * 0.75);
  const radius = Math.max(8, Math.round(fontSize * 0.4));
  const dotSize = Math.max(3, Math.round(fontSize * 0.22));

  ctx.save();

  // Font definitions
  const fontMain = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif`;
  const fontSmall = `600 ${smallFontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif`;
  const fontTag = `bold ${smallFontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif`;

  // Measure text widths
  ctx.font = fontTag;
  const tagWidth = ctx.measureText(tagStr).width + dotSize * 3;

  ctx.font = fontMain;
  const timeWidth = ctx.measureText(timeStr).width;

  ctx.font = fontSmall;
  const dateWidth = ctx.measureText(dateStr).width;
  const subTagWidth = subTagStr ? ctx.measureText(subTagStr).width : 0;

  const contentWidth = Math.max(tagWidth, timeWidth, dateWidth, subTagWidth);
  const boxWidth = contentWidth + pad * 2;
  const lineSpacing = Math.round(fontSize * 0.35);

  let totalLines = 3; // Tag, Time, Date
  if (subTagStr) totalLines += 1;

  const boxHeight =
    pad * 2 +
    smallFontSize +
    fontSize +
    smallFontSize +
    lineSpacing * (totalLines - 1);

  const boxX = margin;
  const boxY = Math.max(margin, canvas.height - boxHeight - margin);

  // Background Box
  ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
  ctx.shadowBlur = Math.round(fontSize * 0.4);
  ctx.shadowOffsetY = Math.round(fontSize * 0.15);

  drawRoundedRect(ctx, boxX, boxY, boxWidth, boxHeight, radius);
  ctx.fillStyle = "rgba(15, 23, 42, 0.82)"; // Slate 900 semi-transparan
  ctx.fill();

  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // Border Box
  ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
  ctx.lineWidth = Math.max(1.5, Math.round(fontSize / 14));
  ctx.stroke();

  // Inner text drawing
  let currentY = boxY + pad;

  // Line 1: Tag & Live Indicator Dot
  // Glowing dot (Orange / Emerald)
  const dotX = boxX + pad + dotSize;
  const dotY = currentY + smallFontSize / 2;
  ctx.beginPath();
  ctx.arc(dotX, dotY, dotSize, 0, Math.PI * 2);
  ctx.fillStyle = "#f97316"; // Bright Orange
  ctx.fill();

  ctx.font = fontTag;
  ctx.fillStyle = "#fb923c"; // Orange 400
  ctx.textBaseline = "top";
  ctx.fillText(tagStr, boxX + pad + dotSize * 2.5, currentY);

  currentY += smallFontSize + lineSpacing;

  // Line 2: Big Time (HH:mm:ss WIB)
  ctx.font = fontMain;
  ctx.fillStyle = "#ffffff";
  ctx.fillText(timeStr, boxX + pad, currentY);

  currentY += fontSize + lineSpacing;

  // Line 3: Date (Hari, DD Bulan YYYY)
  ctx.font = fontSmall;
  ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
  ctx.fillText(dateStr, boxX + pad, currentY);

  if (subTagStr) {
    currentY += smallFontSize + lineSpacing;
    ctx.font = fontSmall;
    ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
    ctx.fillText(subTagStr, boxX + pad, currentY);
  }

  ctx.restore();

  // 4. Konversi canvas ke Blob & File JPEG
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Gagal mengonversi gambar watermark ke Blob"));
          return;
        }
        const fileName = `overtime-${Date.now()}.jpg`;
        const file = new File([blob], fileName, { type: "image/jpeg" });
        const dataUrl = URL.createObjectURL(blob);
        resolve({
          file,
          blob,
          dataUrl,
          timestampText: `${dateStr} • ${timeStr}`,
        });
      },
      "image/jpeg",
      0.92
    );
  });
}
