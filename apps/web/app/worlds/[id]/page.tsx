"use client";

import { useEffect, useState, use } from "react";
import { ArrowLeft, Loader2, ExternalLink } from "lucide-react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { getWorld, selectSpzUrl, type World } from "@/lib/worldlabs";

const ALTERNATE_WORLD_ID = "b2d84d7e-5bed-42e4-8e9a-3eef480fc2c4";

const SplatViewer = dynamic<{ spzUrl: string; alternateWorldId?: string }>(
  () => import("@/components/splat-viewer/splat-viewer").then((m) => ({
    default: m.SplatViewer,
  })),
  { ssr: false },
);

type Status = "loading" | "error" | "ready";

export default function WorldPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [world, setWorld] = useState<World | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const data = await getWorld(id);
        if (cancelled) return;
        setWorld(data);
        setStatus("ready");
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load world");
        setStatus("error");
      }
    }

    load();
    return () => { cancelled = true; };
  }, [id]);

  const spzUrl = world ? selectSpzUrl(world) : null;

  return (
    <div className="flex h-screen w-screen flex-col bg-background font-mono">
      {/* Top bar */}
      <div
        className="flex items-center gap-3 border-b px-4 py-3"
        style={{ borderColor: "oklch(1 0 0 / 10%)" }}
      >
        <Link
          href="/dashboard"
          className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.15em] text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3" />
          Dashboard
        </Link>

        <div
          className="h-4 w-px"
          style={{ background: "oklch(1 0 0 / 10%)" }}
        />

        <span
          className="text-xs font-semibold uppercase tracking-[0.15em]"
          style={{ color: "var(--fire-orange, oklch(0.752 0.217 52.149))" }}
        >
          {status === "ready" ? world?.display_name : "Loading..."}
        </span>

        {status === "ready" && world?.world_marble_url && (
          <a
            href={world.world_marble_url}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto flex items-center gap-1 text-[10px] uppercase tracking-[0.1em] text-muted-foreground transition-colors hover:text-foreground"
          >
            Open in Marble
            <ExternalLink className="size-3" />
          </a>
        )}
      </div>

      {/* Content */}
      <div className="flex flex-1 items-center justify-center">
        {status === "loading" && (
          <div className="flex flex-col items-center gap-3">
            <Loader2
              className="size-6 animate-spin"
              style={{ color: "var(--fire-orange, oklch(0.752 0.217 52.149))" }}
            />
            <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
              Loading world...
            </span>
          </div>
        )}

        {status === "error" && (
          <div className="flex flex-col items-center gap-3">
            <span
              className="text-xs font-semibold uppercase tracking-[0.15em]"
              style={{ color: "oklch(0.7 0.2 25)" }}
            >
              Failed to load world
            </span>
            <span className="max-w-md text-center text-[10px] text-muted-foreground">
              {error}
            </span>
            <Link
              href="/dashboard"
              className="mt-2 text-[10px] uppercase tracking-[0.15em] text-muted-foreground transition-colors hover:text-foreground"
            >
              Back to Dashboard
            </Link>
          </div>
        )}

        {status === "ready" && world && spzUrl && (
          <SplatViewer spzUrl={spzUrl} alternateWorldId={ALTERNATE_WORLD_ID} />
        )}

        {status === "ready" && world && !spzUrl && (
          <iframe
            src={world.world_marble_url}
            title={world.display_name}
            className="h-full w-full border-0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope"
            allowFullScreen
          />
        )}
      </div>
    </div>
  );
}
