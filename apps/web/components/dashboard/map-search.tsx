"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { Loader2, MapPin, Search } from "lucide-react";
import type mapboxgl from "mapbox-gl";

import {
  NOMINATIM_BASE_URL,
  NOMINATIM_USER_AGENT,
  SEARCH_DEBOUNCE_MS,
  SEARCH_MAX_RESULTS,
  SEARCH_FLY_TO_ZOOM,
  SEARCH_FLY_TO_SPEED,
} from "@/lib/dashboard-constants";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  name?: string;
  type?: string;
}

interface SearchResult {
  id: number;
  name: string;
  address: string;
  lat: number;
  lng: number;
}

interface MapSearchProps {
  map: mapboxgl.Map;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function parseResults(raw: NominatimResult[]): SearchResult[] {
  return raw.map((r) => {
    const parts = r.display_name.split(", ");
    const name = r.name || parts[0] || r.type || "Unknown";
    const address = parts.slice(1, 4).join(", ");
    return {
      id: r.place_id,
      name,
      address,
      lat: parseFloat(r.lat),
      lng: parseFloat(r.lon),
    };
  });
}

// ---------------------------------------------------------------------------
// MapSearch
// ---------------------------------------------------------------------------
export function MapSearch({ map }: MapSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // -----------------------------------------------------------------------
  // Debounced Nominatim fetch
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setIsOpen(false);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    timerRef.current = setTimeout(async () => {
      // Cancel previous in-flight request
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const params = new URLSearchParams({
          q: trimmed,
          format: "json",
          limit: String(SEARCH_MAX_RESULTS),
        });

        const res = await fetch(`${NOMINATIM_BASE_URL}?${params}`, {
          headers: { "User-Agent": NOMINATIM_USER_AGENT },
          signal: controller.signal,
        });

        if (!res.ok) throw new Error(`Nominatim ${res.status}`);

        const data: NominatimResult[] = await res.json();
        const parsed = parseResults(data);

        setResults(parsed);
        setIsOpen(parsed.length > 0);
        setActiveIndex(-1);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setResults([]);
          setIsOpen(false);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query]);

  // -----------------------------------------------------------------------
  // Click outside → close dropdown
  // -----------------------------------------------------------------------
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // -----------------------------------------------------------------------
  // Select a result → fly to location
  // -----------------------------------------------------------------------
  const handleSelect = useCallback(
    (result: SearchResult) => {
      map.flyTo({
        center: [result.lng, result.lat],
        zoom: SEARCH_FLY_TO_ZOOM,
        speed: SEARCH_FLY_TO_SPEED,
      });
      setQuery(result.name);
      setIsOpen(false);
      inputRef.current?.blur();
    },
    [map]
  );

  // -----------------------------------------------------------------------
  // Keyboard navigation
  // -----------------------------------------------------------------------
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (!isOpen || results.length === 0) {
        if (e.key === "Escape") {
          setIsOpen(false);
          inputRef.current?.blur();
        }
        return;
      }

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setActiveIndex((prev) =>
            prev < results.length - 1 ? prev + 1 : 0
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          setActiveIndex((prev) =>
            prev > 0 ? prev - 1 : results.length - 1
          );
          break;
        case "Enter":
          e.preventDefault();
          if (activeIndex >= 0 && activeIndex < results.length) {
            handleSelect(results[activeIndex]);
          }
          break;
        case "Escape":
          e.preventDefault();
          setIsOpen(false);
          inputRef.current?.blur();
          break;
      }
    },
    [isOpen, results, activeIndex, handleSelect]
  );

  return (
    <div
      ref={containerRef}
      className="absolute left-4 top-4 z-[900] w-72 font-mono"
    >
      {/* Search input */}
      <div
        className="relative flex items-center border"
        style={{
          background: "oklch(0.16 0.01 45 / 85%)",
          borderColor: "oklch(1 0 0 / 8%)",
          boxShadow: "0 0 20px oklch(0.752 0.217 52.149 / 6%)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
        }}
      >
        {/* Top accent line */}
        <div
          className="absolute inset-x-0 top-0 h-[1px]"
          style={{
            background: "linear-gradient(90deg, transparent, var(--fire-orange), var(--fire-amber), transparent)",
            opacity: 0.4,
          }}
        />
        <div className="flex size-9 shrink-0 items-center justify-center text-muted-foreground">
          {isLoading ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Search className="size-3.5" />
          )}
        </div>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            if (results.length > 0) setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder="SEARCH LOCATION"
          className="h-9 flex-1 bg-transparent pr-3 text-xs uppercase tracking-[0.1em] text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
        />
      </div>

      {/* Results dropdown */}
      {isOpen && results.length > 0 && (
        <div
          className="mt-px max-h-60 overflow-y-auto border search-scrollbar"
          style={{
            background: "oklch(0.16 0.01 45 / 85%)",
            borderColor: "oklch(1 0 0 / 8%)",
            boxShadow: "0 0 20px oklch(0.752 0.217 52.149 / 6%)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
          }}
        >
          {results.map((result, idx) => (
            <button
              key={result.id}
              type="button"
              className="flex w-full items-start gap-2.5 border-b px-3 py-2.5 text-left transition-colors last:border-b-0"
              style={{
                borderColor: "var(--grid-line)",
                background:
                  idx === activeIndex ? "oklch(0.752 0.217 52.149 / 8%)" : "transparent",
              }}
              onMouseEnter={() => setActiveIndex(idx)}
              onClick={() => handleSelect(result)}
            >
              <MapPin className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-foreground">
                  {result.name}
                </p>
                <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                  {result.address}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
