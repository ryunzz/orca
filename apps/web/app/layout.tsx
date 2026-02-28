import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter, Space_Grotesk } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["400", "500", "600", "700"],
});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ORCA — Emergency Intelligence Platform",
  description:
    "AI-powered emergency simulation and predictive intelligence for incident commanders and first responders.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`dark ${inter.variable} ${spaceGrotesk.variable}`}>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        style={{ backgroundColor: "#212024" }}
      >
        {children}
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              fontFamily: "var(--font-geist-mono), monospace",
              fontSize: "11px",
              letterSpacing: "0.05em",
              background: "oklch(0.16 0.01 45 / 92%)",
              border: "1px solid oklch(1 0 0 / 10%)",
              color: "oklch(0.9 0 0)",
              backdropFilter: "blur(16px)",
              WebkitBackdropFilter: "blur(16px)",
              boxShadow: "0 4px 24px oklch(0 0 0 / 40%), 0 0 0 1px oklch(1 0 0 / 5%)",
              borderRadius: "0",
              padding: "12px 16px",
            },
            classNames: {
              success: "toast-success",
              error: "toast-error",
            },
          }}
          theme="dark"
        />
      </body>
    </html>
  );
}
