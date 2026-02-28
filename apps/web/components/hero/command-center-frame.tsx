"use client";

// ─── Component ───────────────────────────────────────────────────────────────
export function CommandCenterFrame() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Dot Grid Background */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `
            radial-gradient(circle 1px at center, oklch(1 0 0 / 2%) 0%, transparent 100%),
            radial-gradient(circle 1px at center, oklch(1 0 0 / 4%) 0%, transparent 100%)
          `,
          backgroundSize: "32px 32px, 160px 160px",
          backgroundPosition: "0 0, 0 0",
        }}
      />

      {/* Globe proximity glow */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 50% 45% at 70% 55%, oklch(0.752 0.217 52.149 / 18%), transparent)",
        }}
      />
    </div>
  );
}
