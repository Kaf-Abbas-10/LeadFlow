import { NextResponse, type NextRequest } from "next/server";

const API_URL = process.env.LEADFLOW_API_URL ?? "http://127.0.0.1:8300";

// /api/* -> the Python API (FastAPI). The extra header lets free ngrok tunnels pass API calls through.
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const headers = new Headers(request.headers);
  headers.set("ngrok-skip-browser-warning", "1");
  return NextResponse.rewrite(new URL(`${pathname}${search}`, API_URL), { request: { headers } });
}

export const config = {
  matcher: ["/api/:path*"],
};
