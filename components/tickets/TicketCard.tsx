'use client'

import { LiveTicket } from '@/lib/hooks/useAgentLoop'
import { TicketCategory, TicketTier } from '@/lib/types'

interface Props {
  ticket: LiveTicket
  isSelected: boolean
  onClick: () => void
}

const CAT_CLS: Record<TicketCategory, string> = {
  AUTH:    'b-auth',
  DATA:    'b-data',
  API:     'b-api',
  BILLING: 'b-billing',
  INFRA:   'b-infra',
  PERF:    'b-perf',
}

const TIER_CLS: Record<TicketTier, string> = {
  L1: 'b-l1',
  L2: 'b-l2',
  L3: 'b-l3',
}

// Human-readable status labels
const STATUS_LABEL: Record<string, string> = {
  queued:    'QUEUED',
  running:   'RUNNING',
  done:      'RESOLVED',
  escalated: 'HUMAN REQ',
}

export default function TicketCard({ ticket, isSelected, onClick }: Props) {
  const timeLabel =
    ticket.fixedInMs
      ? `${ticket.tier === 'L3' ? 'escalated' : 'fixed'} in ${Math.round(ticket.fixedInMs / 1000)}s`
      : ticket.status === 'running'
      ? 'agent working…'
      : 'queued'

  return (
    <div
      className={`tkt tkt-${ticket.status}${isSelected ? ' tkt-sel' : ''}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onClick()}
    >
      {/* Accent bar rendered via ::before in CSS */}

      {/* Row 1: id + badges */}
      <div className="tkt-r1">
        <span className="tkt-id">
          {ticket.id}
          <span className="tkt-conf"> · {ticket.conf}%</span>
        </span>
        <div className="tkt-badges">
          <span className={`badge ${CAT_CLS[ticket.cat]}`}>{ticket.cat}</span>
          <span className={`badge ${TIER_CLS[ticket.tier]}`}>{ticket.tier}</span>
        </div>
      </div>

      {/* Title */}
      <div className="tkt-title">{ticket.title}</div>

      {/* File */}
      <div className="tkt-file">{ticket.file}</div>

      {/* Description — only show first 80 chars */}
      <div className="tkt-desc">{ticket.description.slice(0, 88)}{ticket.description.length > 88 ? '…' : ''}</div>

      {/* Progress bar */}
      <div className="tkt-track">
        <div
          className={`tkt-bar tkt-bar-${ticket.status}`}
          style={{ width: `${ticket.progress}%` }}
        />
      </div>

      {/* Footer */}
      <div className="tkt-footer">
        <span className="tkt-time">{timeLabel}</span>
        <span className={`tkt-status tkt-s-${ticket.status}`}>
          {STATUS_LABEL[ticket.status] ?? ticket.status.toUpperCase()}
        </span>
      </div>
    </div>
  )
}
