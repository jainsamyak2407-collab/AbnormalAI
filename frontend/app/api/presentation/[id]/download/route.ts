import { NextRequest } from "next/server"

const BACKEND = process.env.BACKEND_URL ?? "http://localhost:8000"

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const upstream = await fetch(`${BACKEND}/api/presentation/${id}/download`)

  if (!upstream.ok) {
    const err = await upstream.json().catch(() => ({}))
    return new Response(JSON.stringify(err), {
      status: upstream.status,
      headers: { "Content-Type": "application/json" },
    })
  }

  const contentDisposition = upstream.headers.get("Content-Disposition") ?? 'attachment; filename="presentation.pptx"'

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "Content-Disposition": contentDisposition,
      "Cache-Control": "no-cache",
    },
  })
}
