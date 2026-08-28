"use client";

import { useState, useCallback } from "react";
import { compressImage, CompressOptions } from "@/lib/imageCompression";

interface UseCompressedUploadResult {
  file: File | null;
  preview: string | null;
  isCompressing: boolean;
  error: string | null;
  handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  reset: () => void;
}

export function useCompressedUpload(
  options?: CompressOptions
): UseCompressedUploadResult {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = e.target.files?.[0];
      if (!selected) return;

      setError(null);
      setIsCompressing(true);
      try {
        const compressed = await compressImage(selected, options);
        setFile(compressed);
        setPreview(URL.createObjectURL(compressed));
      } catch (err) {
        setError("Gagal memproses foto, coba lagi.");
        console.error(err);
      } finally {
        setIsCompressing(false);
      }
    },
    [options]
  );

  const reset = useCallback(() => {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null);
    setPreview(null);
    setError(null);
  }, [preview]);

  return { file, preview, isCompressing, error, handleFileChange, reset };
}