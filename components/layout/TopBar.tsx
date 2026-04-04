'use client'

import { AgentStats } from '@/lib/types'

interface Props { stats: AgentStats }

export default function TopBar({ stats }: Props) {
  const avg = stats.avgFixMs ? `${Math.round(stats.avgFixMs / 1000)}s` : '—'

  return (
    <header className="topbar">
      <div className="topbar-left">
        <span className="logo">
          NEURALOPS
          <span className="logo-sub">/ autonomous repair agent</span>
        </span>
        <div className="live-badge">
          <span className="live-dot" />
          <span className="live-text">AGENT ONLINE</span>
        </div>
      </div>
      <div className="topbar-right">
        <Stat label="DETECTED"  value={stats.total}        color="cyan"  />
        <div className="tb-divider" />
        <Stat label="RESOLVED"  value={stats.resolved}     color="green" />
        <div className="tb-divider" />
        <Stat label="L2 REVIEW" value={stats.escalated}    color="amber" />
        <div className="tb-divider" />
        <Stat label="HUMAN REQ" value={stats.humanNeeded}  color="red"   />
        <div className="tb-divider" />
        <Stat label="AVG FIX"   value={avg}                color="cyan"  />
      </div>
    </header>
  )
}

function Stat({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="tb-stat">
      <div className={`tb-stat-n tb-${color}`}>{value}</div>
      <div className="tb-stat-l">{label}</div>
    </div>
  )
}
