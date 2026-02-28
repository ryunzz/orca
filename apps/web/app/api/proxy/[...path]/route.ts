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
