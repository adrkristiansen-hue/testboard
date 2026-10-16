"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

type Tone = "info" | "error" | "success";
interface Toast {
  id: number;
  message: string;
  tone: Tone;
}

const ToastContext = createContext<(message: string, tone?: Tone) => void>(() => {});

let counter = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((message: string, tone: Tone = "info") => {
    const id = ++counter;
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === "error" ? 6000 : 3500);
  }, []);
  return (
    <ToastContext value={push}>
      {children}
      {/* Live region so screen readers announce results of drag-and-drop and saves */}
      <div aria-live="polite" role="status" className="fixed bottom-4 left-1/2 z-[100] flex -translate-x-1/2 flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`rounded-md px-4 py-2 text-sm font-medium text-white shadow-lg ${t.tone === "error" ? "bg-red-700" : t.tone === "success" ? "bg-green-700" : "bg-gray-800"}`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
