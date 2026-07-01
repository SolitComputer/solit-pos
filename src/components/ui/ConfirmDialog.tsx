"use client";

import { useState, useEffect } from "react";
import { create } from "zustand";

interface ConfirmState {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText: string;
  cancelText?: string;
  variant?: "default" | "danger" | "success" | "warning";
  requireText?: string;
  icon?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const useConfirmStore = create<ConfirmState>((set) => ({
  isOpen: false,
  title: "",
  message: "",
  confirmText: "Ya",
  cancelText: "Batal",
  variant: "default",
  requireText: undefined,
  icon: undefined,
  onConfirm: () => {},
  onCancel: () => {},
}));

export const useConfirm = () => {
  const [input, setInput] = useState("");

  const confirm = (options: {
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    variant?: "default" | "danger" | "success" | "warning";
    requireText?: string;
    icon?: string;
  }): Promise<boolean> => {
    return new Promise((resolve) => {
      useConfirmStore.setState({
        isOpen: true,
        ...options,
        onConfirm: () => {
          useConfirmStore.setState({ isOpen: false });
          setInput("");
          resolve(true);
        },
        onCancel: () => {
          useConfirmStore.setState({ isOpen: false });
          setInput("");
          resolve(false);
        },
      });
    });
  };

  return confirm;
};

export default function ConfirmDialog() {
  const {
    isOpen,
    title,
    message,
    confirmText,
    cancelText = "Batal",
    variant = "default",
    requireText,
    icon,
    onConfirm,
    onCancel,
  } = useConfirmStore();

  const [inputValue, setInputValue] = useState("");
  const isConfirmed = !requireText || inputValue.trim().toUpperCase() === requireText;

  useEffect(() => {
    if (!isOpen) setInputValue("");
  }, [isOpen]);

  if (!isOpen) return null;

  const variantStyles = {
    danger: "bg-red-600 hover:bg-red-700",
    success: "bg-emerald-600 hover:bg-emerald-700",
    warning: "bg-orange-600 hover:bg-orange-700",
    default: "bg-[#1a1a2e] hover:bg-[#16213e]",
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70">
      <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
        <div className="p-6">
          {icon && <div className="text-4xl mb-4">{icon}</div>}
          
          <h3 className="text-xl font-bold text-gray-900">{title}</h3>
          <p className="mt-3 text-gray-600 leading-relaxed">{message}</p>

          {requireText && (
            <div className="mt-5">
              <p className="text-xs text-gray-500 mb-1.5">
                Ketik <span className="font-mono font-bold text-red-600">{requireText}</span> untuk konfirmasi
              </p>
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-2xl focus:outline-none focus:border-red-500 font-mono"
                placeholder={requireText}
              />
            </div>
          )}
        </div>

        <div className="border-t border-gray-100 p-4 flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 h-12 rounded-2xl border border-gray-300 font-medium text-gray-700 hover:bg-gray-50 transition"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            disabled={!!requireText && !isConfirmed}
            className={`flex-1 h-12 rounded-2xl text-white font-semibold transition disabled:opacity-50 ${variantStyles[variant]}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}