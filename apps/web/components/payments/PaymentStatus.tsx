"use client";

import { useEffect, useState } from "react";
import { getPaymentStatus } from "@/lib/api";

export function PaymentStatus({ nodeId }: { nodeId: string }) {
  const [status, setStatus] = useState("pending");

  useEffect(() => {
    let mounted = true;
    getPaymentStatus(nodeId).then((data) => {
      if (mounted) setStatus(data.status);
    });
    return () => {
      mounted = false;
    };
  }, [nodeId]);

  return (
    <div className="rounded border border-slate-700 bg-surface p-3">
      <p className="text-sm">Node: {nodeId}</p>
      <p className="text-xs text-slate-300">Payment status: {status}</p>
    </div>
  );
}
