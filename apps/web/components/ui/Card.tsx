import type { ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-lg border border-slate-700 bg-surface/80 p-4 ${className}`}>{children}</div>;
}
