"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { MAP_FADE_IN_DURATION_MS } from "@/lib/transition-constants";
import { DashboardLoading } from "@/components/dashboard/dashboard-loading";
import "./dashboard.css";

const DashboardMap = dynamic(
  () =>
    import("@/components/dashboard/dashboard-map").then(
      (mod) => mod.DashboardMap
    ),
  { ssr: false }
);

export default function DashboardPage() {
  const [showMap, setShowMap] = useState(false);

  return (
    <>
      {/* Always mount so mapbox initializes in parallel */}
      <motion.div
        className="h-screen w-screen"
        initial={{ opacity: 0 }}
        animate={{ opacity: showMap ? 1 : 0 }}
        transition={{ duration: MAP_FADE_IN_DURATION_MS / 1000, ease: "easeOut" }}
      >
        <DashboardMap />
      </motion.div>

      {/* Loading overlay — on top while map loads underneath */}
      {!showMap && <DashboardLoading onComplete={() => setShowMap(true)} />}
    </>
  );
}
