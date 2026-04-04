// lib/types/index.ts

export type TicketTier = 'L1' | 'L2' | 'L3'
export type TicketStatus = 'queued' | 'running' | 'done' | 'escalated'
export type TicketCategory = 'AUTH' | 'DATA' | 'API' | 'BILLING' | 'INFRA' | 'PERF'

export interface CodeLine {
  /** Line number shown in gutter. Empty string for added/removed virtual lines */
  n: number | ''
  /** n=normal, rem=removed, add=added, hl=highlighted bug */
  t: 'n' | 'rem' | 'add' | 'hl'
  code: string
}

export interface AgentLogLine {
  delay: number  // ms offset from ticket start
  level: 'info' | 'warn' | 'success' | 'cyan' | 'dim'
  text: string
}

export interface Ticket {
  id: string
  title: string
  description: string
  file: string
  tier: TicketTier
  cat: TicketCategory
  conf: number       // confidence 0–100
  fixTime: number    // simulated total ms to fix
  before: CodeLine[]
  after: CodeLine[]
  logs: AgentLogLine[]
}

export interface AgentStats {
  total: number
  resolved: number
  escalated: number  // L2 count
  humanNeeded: number // L3 count
  avgFixMs: number | null
}
