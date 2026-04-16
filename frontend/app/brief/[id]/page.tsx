export default function BriefPage({ params }: { params: { id: string } }) {
  return (
    <main className="flex items-center justify-center min-h-screen font-sans text-sm" style={{ color: "#6B7280" }}>
      <p>Brief {params.id} — Phase 7</p>
    </main>
  )
}
