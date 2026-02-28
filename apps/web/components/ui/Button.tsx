import type { ButtonHTMLAttributes, ReactNode } from "react";

export function Button({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return (
    <button
      {...props}
      className={`rounded px-3 py-1 transition ${props.className ?? "bg-cyan-500 text-black hover:brightness-110"}`}
    >
      {children}
    </button>
  );
}
