import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'NeuralOps — Autonomous Repair Agent',
  description: 'Catapult · L1/L2/L3 autonomous code repair dashboard',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
