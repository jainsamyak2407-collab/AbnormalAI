const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export async function checkHealth() {
  const res = await fetch(`${API_URL}/api/health`)
  return res.json()
}
