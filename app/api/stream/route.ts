/**
 * GET /api/stream?ticketId=TKT-0048
 *
 * Server-Sent Events stream of agent log lines.
 * Currently replays dummy data with delays.
 *
 * PRODUCTION SWAP (backend team):
 * Replace the dummy replay loop with your real LangChain agent stream.
 * The frontend useAgentLoop hook reads from this endpoint when you
 * uncomment the EventSource lines in that file.
 *
 * Event format:  data: { "level": "info" | "warn" | ..., "text": "..." }
 * Patch signal:  data: { "type": "patch-applied", "ticketId": "..." }
 */

import { DUMMY_TICKETS } from '@/lib/data/tickets'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const ticketId = searchParams.get('ticketId')
  const ticket   = DUMMY_TICKETS.find(t => t.id === ticketId)
  const encoder  = new TextEncoder()

  const stream = new ReadableStream({
    async start(ctrl) {
      const send = (data: object) =>
        ctrl.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))

      if (!ticket) {
        send({ level: 'warn', text: `ticket ${ticketId} not found` })
        ctrl.close()
        return
      }

      for (const log of ticket.logs) {
        await new Promise(r => setTimeout(r, log.delay))
        send({ level: log.level, text: log.text })
      }

      send({ type: 'patch-applied', ticketId: ticket.id })
      ctrl.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
    },
  })
}
