import type { Metadata } from "next"
import { Inter, Source_Serif_4, IBM_Plex_Mono } from "next/font/google"
import "./globals.css"

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
})

const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-source-serif",
  display: "swap",
  weight: ["300", "400", "600", "700"],
})

const ibmMono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-ibm-mono",
  display: "swap",
  weight: ["400", "500", "600", "700"],
})

export const metadata: Metadata = {
  title: "Abnormal Brief Studio",
  description:
    "Upload your security data. Pick an audience. Get a consulting-grade brief in under three minutes.",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${inter.variable} ${sourceSerif.variable} ${ibmMono.variable}`}>
      <body className="min-h-screen antialiased">
        {children}
      </body>
    </html>
  )
}
