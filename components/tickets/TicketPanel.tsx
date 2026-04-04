'use client'

import { LiveTicket } from '@/lib/hooks/useAgentLoop'
import TicketCard from './TicketCard'

interface Props {
  tickets: LiveTicket[]
  activeTicketId: string | null
  selectedId: string | null
  onSelect: (id: string) => void
}

export default function TicketPanel({ tickets, activeTicketId, selectedId, onSelect }: Props) {
  const running    = tickets.filter(t => t.status === 'running').length
  const queued     = tickets.filter(t => t.status === 'queued').length
  const resolved   = tickets.filter(t => t.status === 'done').length
  const human      = tickets.filter(t => t.status === 'escalated').length

  return (
    <aside className="ticket-panel">

      {/* Header */}
      <div className="tp-header">
        <span className="tp-title">TICKET QUEUE</span>
        <span className="tp-count">{tickets.length}</span>
      </div>

      {/* Mini stat strip */}
      <div className="tp-strip">
        <MiniStat value={running}  label="running"  color="amber" />
        <div className="tp-strip-div" />
        <MiniStat value={queued}   label="queued"   color="dim"   />
        <div className="tp-strip-div" />
        <MiniStat value={resolved} label="resolved" color="green" />
        <div className="tp-strip-div" />
        <MiniStat value={human}    label="human"    color="red"   />
      </div>

      {/* Tier legend */}
      <div className="tp-legend">
        <span className="legend-item"><span className="legend-dot ld-green" />L1 auto-fix</span>
        <span className="legend-item"><span className="legend-dot ld-amber" />L2 fix+review</span>
        <span className="legend-item"><span className="legend-dot ld-red"   />L3 human req</span>
      </div>

      {/* Ticket list */}
      <div className="tkt-list">
        {tickets.length === 0 && (
          <div className="tkt-empty">scanning workspace…</div>
        )}
        {tickets.map(t => (
          <TicketCard
            key={t.id}
            ticket={t}
            isSelected={t.id === (selectedId ?? activeTicketId)}
            onClick={() => onSelect(t.id)}
          />
        ))}
      </div>
    </aside>
  )
}

function MiniStat({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div className="tp-mini-stat">
      <span className={`tp-mini-n tp-mini-${color}`}>{value}</span>
      <span className="tp-mini-l">{label}</span>
    </div>
  )
}
