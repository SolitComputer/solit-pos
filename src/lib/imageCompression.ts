"use client";

import imageCompression from "browser-image-compression";

export interface CompressOptions {
  maxSizeMB?: number;
  maxWidthOrHeight?: number;
  quality?: number;
}

export async function compressImage(
  file: File,
  options: CompressOptions = {}
): Promise<File> {
  const {
    maxSizeMB = 1,
    maxWidthOrHeight = 1920,
    quality = 0.8,
  } = options;

  if (!file.type.startsWith("image/")) return file; // bukan gambar, skip
  if (file.size / 1024 / 1024 < maxSizeMB) return file; // udah kecil, skip

  try {
    return await imageCompression(file, {
      maxSizeMB,
      maxWidthOrHeight,
      useWebWorker: true,
      initialQuality: quality,
    });
  } catch (err) {
    console.error("Compress gagal, fallback ke file asli:", err);
    return file; // biar upload tetap jalan walau compress error
  }
}
