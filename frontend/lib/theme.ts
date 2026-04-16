// Color constants matching tailwind.config.ts. Use these in inline styles when
// Tailwind class names aren't available (e.g., dynamic values, canvas elements).

export const colors = {
  background: "#FAFAF7",
  foreground: "#1A1A1A",
  accent: "#4C566A",
  accentForeground: "#FAFAF7",
  muted: "#F0EFE9",
  mutedForeground: "#6B7280",
  border: "#E5E4DF",
  evidenceBg: "#F0E9CC",
  evidenceText: "#7A6B3A",
  risk: "#C0392B",
  riskMuted: "#F5E6E4",
} as const

export type ColorKey = keyof typeof colors
