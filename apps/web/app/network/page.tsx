import { AgentNetwork } from "@/components/network/AgentNetwork";

export default function NetworkPage() {
  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-semibold">Agent Network</h2>
      <p className="text-sm text-slate-300">Connected OpenClaw and human labeler nodes.</p>
      <AgentNetwork />
    </section>
  );
}

cat <<'EOF' > apps/web/app/api/proxy/[...path]/route.ts
import { NextRequest } from "next/server";
import { API_URL } from "@/lib/constants";

const buildUrl = (path: string[]) => {
  const tail = path.join("/");
  return `${API_URL}/${tail}`;
};

const proxy = async (req: NextRequest, path: string[]) => {
  const body = req.method !== "GET" && req.method !== "HEAD" ? await req.text() : undefined;
  const target = buildUrl(path);
  const init: RequestInit = {
    method: req.method,
    headers: {
      "content-type": req.headers.get("content-type") ?? "application/json",
    },
    body,
  };

  const response = await fetch(target, init);
  const text = await response.text();
  return new Response(text, {
    status: response.status,
    headers: response.headers,
  });
};

export const GET = (req: NextRequest, { params }: { params: { path: string[] } }) =>
  proxy(req, params.path);
export const POST = (req: NextRequest, { params }: { params: { path: string[] } }) =>
  proxy(req, params.path);
export const PUT = (req: NextRequest, { params }: { params: { path: string[] } }) =>
  proxy(req, params.path);
export const DELETE = (req: NextRequest, { params }: { params: { path: string[] } }) =>
  proxy(req, params.path);
