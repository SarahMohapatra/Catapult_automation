'use client'

import { useState } from 'react'
import { useAgentLoop } from '@/lib/hooks/useAgentLoop'
import TopBar from '@/components/layout/TopBar'
import TicketPanel from '@/components/tickets/TicketPanel'
import VSCodeEmbed from '@/components/editor/VSCodeEmbed'
import Terminal from '@/components/terminal/Terminal'

export default function HomePage() {
  const { tickets, activeTicketId, terminalLines, stats } = useAgentLoop()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Show selected ticket, or fall back to currently-active, or most recent
  const displayId    = selectedId ?? activeTicketId
  const displayTicket = tickets.find(t => t.id === displayId) ?? tickets[tickets.length - 1]

  // Most recently completed ticket (for terminal badge)
  const lastDone = [...tickets].reverse().find(t => t.status === 'done' || t.status === 'escalated')

  function handleSelect(id: string) {
    setSelectedId(prev => (prev === id ? null : id))
  }

  return (
    <div className="shell">
      <div className="scan-line" aria-hidden />

      <TopBar stats={stats} />

      <div className="body">
        <TicketPanel
          tickets={tickets}
          activeTicketId={activeTicketId}
          selectedId={selectedId}
          onSelect={handleSelect}
        />

        <div className="right-panel">
          <VSCodeEmbed
            file={displayTicket?.file ?? null}
            before={displayTicket?.before ?? []}
            after={displayTicket?.after ?? []}
            showDiff={displayTicket?.showDiff ?? false}
            tier={displayTicket?.tier}
          />
          <Terminal
            lines={terminalLines}
            resolvedTier={lastDone?.tier ?? null}
          />
        </div>
      </div>
    </div>
  )
}
