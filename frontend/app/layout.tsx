import type { Metadata } from "next"
import { IBM_Plex_Sans, IBM_Plex_Serif, IBM_Plex_Mono } from "next/font/google"
import "./globals.css"

const ibmSans = IBM_Plex_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
  weight: ["300", "400", "500", "600", "700"],
})

const ibmSerif = IBM_Plex_Serif({
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
  weight: ["300", "400", "600", "700"],
})

const ibmMono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
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
    <html lang="en" className={`${ibmSans.variable} ${ibmSerif.variable} ${ibmMono.variable}`}>
      <body className="min-h-screen antialiased">
        {children}
      </body>
    </html>
  )
}
