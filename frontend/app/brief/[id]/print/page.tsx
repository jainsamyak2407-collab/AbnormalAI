export default function PrintPage({ params }: { params: { id: string } }) {
  return (
    <main className="font-sans text-sm" style={{ color: "#6B7280" }}>
      <p>Print — Brief {params.id} — Phase 8</p>
    </main>
  )
}
