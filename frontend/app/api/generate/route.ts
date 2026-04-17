import { NextRequest } from "next/server"

const BACKEND = process.env.BACKEND_URL ?? "http://localhost:8000"

export async function POST(request: NextRequest) {
  const body = await request.json()

  const upstream = await fetch(`${BACKEND}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })

  if (!upstream.ok) {
    const err = await upstream.json().catch(() => ({}))
    return new Response(JSON.stringify(err), {
      status: upstream.status,
      headers: { "Content-Type": "application/json" },
    })
  }

  // Pass the SSE stream directly to the browser — no buffering
  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}
