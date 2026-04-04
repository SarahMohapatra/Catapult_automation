'use client'

// lib/hooks/useAgentLoop.ts
// Drives the autonomous agent simulation.
// REPLACE the setTimeout-based loop with real SSE from /api/stream when backend is ready.

import { useState, useEffect, useRef, useCallback } from 'react'
import { Ticket, AgentStats, TicketStatus } from '@/lib/types'
import { DUMMY_TICKETS } from '@/lib/data/tickets'

export interface LiveTicket extends Ticket {
  status: TicketStatus
  progress: number     // 0–100
  fixedInMs?: number
  showDiff: boolean    // true once patch is applied
}

export interface TerminalLine {
  id: string
  level: 'info' | 'warn' | 'success' | 'cyan' | 'dim'
  text: string
}

interface AgentState {
  tickets: LiveTicket[]
  activeTicketId: string | null
  terminalLines: TerminalLine[]
  stats: AgentStats
}

const INITIAL_STATS: AgentStats = {
  total: 0,
  resolved: 0,
  escalated: 0,
  humanNeeded: 0,
  avgFixMs: null,
}

export function useAgentLoop() {
  const [state, setState] = useState<AgentState>({
    tickets: [],
    activeTicketId: null,
    terminalLines: [
      { id: 'b0', level: 'dim', text: '$ neuralops --mode autonomous --watch /workspace' },
      { id: 'b1', level: 'dim', text: 'neuralops v0.4.1 · catapult build · agent ready' },
    ],
    stats: INITIAL_STATS,
  })

  const fixTimesRef   = useRef<number[]>([])
  const nextIdxRef    = useRef(0)
  const timersRef     = useRef<ReturnType<typeof setTimeout>[]>([])

  const addTimer = useCallback((fn: () => void, delay: number) => {
    const t = setTimeout(fn, delay)
    timersRef.current.push(t)
    return t
  }, [])

  const clearAllTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout)
    timersRef.current = []
  }, [])

  const pushLine = useCallback((line: Omit<TerminalLine, 'id'>) => {
    setState(prev => ({
      ...prev,
      terminalLines: [...prev.terminalLines, { ...line, id: `${Date.now()}-${Math.random()}` }],
    }))
  }, [])

  const patchTicket = useCallback((id: string, patch: Partial<LiveTicket>) => {
    setState(prev => ({
      ...prev,
      tickets: prev.tickets.map(t => (t.id === id ? { ...t, ...patch } : t)),
    }))
  }, [])

  // ── Core: run one ticket through the agent ──────────────────────────────
  const runTicket = useCallback((tkt: Ticket) => {
    const t0 = Date.now()

    setState(prev => ({
      ...prev,
      activeTicketId: tkt.id,
      tickets: prev.tickets.map(t =>
        t.id === tkt.id ? { ...t, status: 'running' as TicketStatus } : t,
      ),
    }))

    pushLine({ level: 'dim', text: '─'.repeat(56) })

    // Stream log lines with delays
    tkt.logs.forEach(log => {
      addTimer(() => {
        pushLine({ level: log.level, text: log.text })

        // When patch line appears → swap to diff view
        if (log.text.includes('[patch]') && log.text.includes('ready')) {
          patchTicket(tkt.id, { showDiff: true })
        }

        // Animate progress proportionally
        const pct = Math.min(Math.round((log.delay / tkt.fixTime) * 90), 90)
        patchTicket(tkt.id, { progress: pct })
      }, log.delay)
    })

    // Completion
    addTimer(() => {
      const elapsed = Date.now() - t0
      fixTimesRef.current.push(elapsed)
      const avg = Math.round(
        fixTimesRef.current.reduce((a, b) => a + b, 0) / fixTimesRef.current.length,
      )

      const finalStatus: TicketStatus = tkt.tier === 'L3' ? 'escalated' : 'done'

      patchTicket(tkt.id, { status: finalStatus, progress: 100, fixedInMs: elapsed })

      setState(prev => ({
        ...prev,
        activeTicketId: null,
        stats: {
          ...prev.stats,
          resolved:    prev.stats.resolved + (tkt.tier !== 'L3' ? 1 : 0),
          escalated:   prev.stats.escalated + (tkt.tier === 'L2' ? 1 : 0),
          humanNeeded: prev.stats.humanNeeded + (tkt.tier === 'L3' ? 1 : 0),
          avgFixMs: avg,
        },
      }))

      // Queue next ticket after a pause
      addTimer(() => {
        const nextIdx = nextIdxRef.current
        if (nextIdx < DUMMY_TICKETS.length) {
          nextIdxRef.current += 1
          const next = DUMMY_TICKETS[nextIdx]
          setState(prev => ({
            ...prev,
            tickets: [...prev.tickets, { ...next, status: 'queued', progress: 0, showDiff: false }],
            stats: { ...prev.stats, total: prev.stats.total + 1 },
          }))
          addTimer(() => runTicket(next), 900)
        }
      }, 2200)
    }, tkt.fixTime)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addTimer, pushLine, patchTicket])

  // ── Boot ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const first = DUMMY_TICKETS[0]
    nextIdxRef.current = 1

    addTimer(() => {
      pushLine({ level: 'dim', text: '─'.repeat(56) })
      pushLine({ level: 'info', text: '▶ autonomous agent loop started' })
      pushLine({ level: 'dim', text: 'watching: /workspace/lib  /workspace/app/api' })

      setState(prev => ({
        ...prev,
        tickets: [{ ...first, status: 'queued', progress: 0, showDiff: false }],
        stats: { ...prev.stats, total: 1 },
      }))

      addTimer(() => runTicket(first), 900)
    }, 700)

    return clearAllTimers
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return state
}
