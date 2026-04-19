import { NextRequest } from "next/server"

const BACKEND = process.env.BACKEND_URL ?? "http://localhost:8000"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; slideNumber: string }> }
) {
  const { id, slideNumber } = await params
  const body = await request.json().catch(() => ({}))

  const upstream = await fetch(
    `${BACKEND}/api/presentation/${id}/slide/${slideNumber}/revise`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  )

  if (!upstream.ok) {
    const err = await upstream.json().catch(() => ({}))
    return new Response(JSON.stringify(err), {
      status: upstream.status,
      headers: { "Content-Type": "application/json" },
    })
  }

  const data = await upstream.json()
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })
}
