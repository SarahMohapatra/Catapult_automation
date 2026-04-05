'use client'

import { Ticket, TicketPhase } from '@/lib/types'

const FLOW: TicketPhase[] = [
  'detected',
  'classified',
  'investigating',
  'fix_applied',
  'resolved',
]

const LABELS: Record<string, string> = {
  detected: 'Detected',
  classified: 'Classified',
  investigating: 'Investigating',
  fix_applied: 'Fix applied',
  verified: 'Verified',
  resolved: 'Resolved',
  escalated: 'Escalated (human)',
}

function stepReached(current: TicketPhase, step: TicketPhase): boolean {
  if (current === 'escalated') return step === 'escalated'
  const order = ['detected', 'classified', 'investigating', 'fix_applied', 'resolved']
  const ci = order.indexOf(current)
  const si = order.indexOf(step)
  if (ci < 0 || si < 0) return false
  return si <= ci
}

export default function Timeline({ ticket }: { ticket: Ticket | null }) {
  if (!ticket) {
    return (
      <div className="timeline-wrap">
        <div className="timeline-title">EXECUTION TIMELINE</div>
        <div className="timeline-empty">Select a ticket</div>
      </div>
    )
  }

  const cur = ticket.phase
  const escalated = cur === 'escalated' || ticket.status === 'needs_human_review'

  return (
    <div className="timeline-wrap">
      <div className="timeline-title">EXECUTION TIMELINE · {ticket.phase}</div>
      <div className="timeline-track">
        {escalated ? (
          <>
            {FLOW.slice(0, 3).map(ph => (
              <div
                key={ph}
                className={`timeline-node${stepReached(cur, ph) ? ' tn-done' : ''}${cur === ph ? ' tn-active' : ''}`}
              >
                <span className="tn-dot" />
                <span className="tn-label">{LABELS[ph]}</span>
              </div>
            ))}
            <div className="timeline-node tn-active">
              <span className="tn-dot" />
              <span className="tn-label">{LABELS.escalated}</span>
            </div>
          </>
        ) : (
          FLOW.map(ph => (
            <div
              key={ph}
              className={`timeline-node${stepReached(cur, ph) ? ' tn-done' : ''}${cur === ph ? ' tn-active' : ''}`}
            >
              <span className="tn-dot" />
              <span className="tn-label">{LABELS[ph] ?? ph}</span>
            </div>
          ))
        )}
      </div>
      {ticket.classificationReasoning && (
        <div className="timeline-reason">
          <span className="timeline-sub">Classifier</span>
          {ticket.classificationReasoning}
        </div>
      )}
      <div className="timeline-steps">
        <span className="timeline-sub">Agent steps ({ticket.steps?.length ?? 0})</span>
        <div className="timeline-step-list">
          {(ticket.steps ?? []).slice(-12).map((s, i) => (
            <div key={i} className="ts-row">
              <span className="ts-type">{s.type}</span>
              {s.toolName && <span className="ts-tool">{s.toolName}</span>}
              <span className="ts-content">
                {(s.content || '').length > 160 ? s.content.slice(0, 160) + '…' : s.content}
              </span>
            </div>
          ))}
        </div>
      </div>
      {(ticket.finalOutput || ticket.agentOutput?.solution) && (
        <div className="timeline-resolution">
          <span className="timeline-sub">Resolution</span>
          <pre className="timeline-res-text">
            {ticket.resolutionStatus && `[${ticket.resolutionStatus}]\n`}
            {ticket.agentOutput?.solution || ticket.finalOutput || ''}
          </pre>
        </div>
      )}
    </div>
  )
}
