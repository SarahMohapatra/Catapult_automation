import { NextResponse } from 'next/server'
import { DUMMY_TICKETS } from '@/lib/data/tickets'

// GET /api/tickets — returns dummy list
// Replace with real DB/queue when backend is ready
export async function GET() {
  return NextResponse.json({
    tickets: DUMMY_TICKETS.map(({ id, title, file, tier, cat, conf }) => ({
      id, title, file, tier, cat, conf,
    })),
  })
}

// POST /api/tickets — accept new ticket from VS Code extension or webhook
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  console.log('[neuralops] new ticket:', body)
  // TODO (backend team): push to agent queue
  return NextResponse.json({ ok: true, id: `TKT-${Date.now()}` })
}
