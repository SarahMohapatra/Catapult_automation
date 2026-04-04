'use client'

import { useEffect, useRef } from 'react'
import { TerminalLine } from '@/lib/hooks/useAgentLoop'
import { TicketTier } from '@/lib/types'

interface Props {
  lines: TerminalLine[]
  resolvedTier?: TicketTier | null
}

const LEVEL_CLS: Record<TerminalLine['level'], string> = {
  info:    'tl-info',
  warn:    'tl-warn',
  success: 'tl-success',
  cyan:    'tl-cyan',
  dim:     'tl-dim',
}

export default function Terminal({ lines, resolvedTier }: Props) {
  const bodyRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight
    }
  }, [lines])

  return (
    <div className="terminal">
      <div className="term-header">
        <span className="term-title">AGENT LOG</span>
        <div className="term-tabs">
          <button className="term-tab term-tab-on">output</button>
          <button className="term-tab">problems</button>
          <button className="term-tab">debug console</button>
        </div>
        {resolvedTier && (
          <span className={`term-badge term-badge-${resolvedTier.toLowerCase()}`}>
            {resolvedTier === 'L3' ? 'ESCALATED' : `${resolvedTier} RESOLVED`}
          </span>
        )}
      </div>
      <div className="term-body" ref={bodyRef}>
        {lines.map(line => (
          <div key={line.id} className={`term-line ${LEVEL_CLS[line.level]}`}>
            {line.text}
          </div>
        ))}
        <div className="term-prompt">
          $ <span className="term-cursor" />
        </div>
      </div>
    </div>
  )
}
