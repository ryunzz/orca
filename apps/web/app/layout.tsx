import "./globals.css";
import type { ReactNode } from "react";
import Link from "next/link";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen">
          <header className="border-b border-slate-700 bg-surface/90 px-6 py-4">
            <div className="mx-auto flex max-w-6xl items-center justify-between">
              <h1 className="text-lg font-semibold">WorldGen Emergency</h1>
              <nav className="flex gap-4 text-sm">
                <Link href="/">Dashboard</Link>
                <Link href="/simulation">Simulations</Link>
                <Link href="/network">Agent Network</Link>
              </nav>
            </div>
          </header>
          <main className="mx-auto max-w-6xl p-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
