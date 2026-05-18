"use client";

import { cn } from "@/lib/utils";
import type { ConnectionStatus } from "@/stores/online-store";

interface ConnectionBannerProps {
  status: ConnectionStatus;
}

export function ConnectionBanner({ status }: ConnectionBannerProps) {
  if (status === "live" || status === "idle") return null;

  const label =
    status === "connecting"
      ? "Подключение…"
      : status === "reconnecting"
        ? "Переподключение…"
        : "Соединение закрыто";

  const color =
    status === "reconnecting"
      ? "bg-orange-500/90"
      : status === "closed"
        ? "bg-red-500/90"
        : "bg-[color:var(--accent)]/90";

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-x-0 top-0 z-30 flex items-center justify-center py-2 text-xs font-semibold text-black",
        color
      )}
    >
      <span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-current" />
      {label}
    </div>
  );
}
