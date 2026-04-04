'use client'

/**
 * VSCodeEmbed
 *
 * TWO MODES:
 *
 * 1. DUMMY (default) — pixel-perfect fake VS Code with live diff.
 *    Works immediately, no setup. Use this for the hackathon demo.
 *
 * 2. REAL VS CODE — set env var NEXT_PUBLIC_VSCODE_REPO=https://github.com/org/repo
 *    Loads vscode.dev/github/org/repo in an iframe.
 *    When the agent applies a patch, postMessages the file path so VS Code opens it.
 *
 * HOW TO SWITCH TO REAL MODE:
 *   1. Push code to GitHub (public repo or authenticated)
 *   2. Add to .env.local:
 *        NEXT_PUBLIC_VSCODE_REPO=https://github.com/YOUR_ORG/neuralops
 *   3. Restart dev server — iframe loads automatically.
 *   4. The postMessage to open files is already wired below.
 */

import { useEffect, useRef } from 'react'
import { CodeLine } from '@/lib/types'

interface Props {
  file: string | null
  before: CodeLine[]
  after: CodeLine[]
  showDiff: boolean
  tier?: string
}

const REPO = process.env.NEXT_PUBLIC_VSCODE_REPO

export default function VSCodeEmbed({ file, before, after, showDiff, tier }: Props) {
  const iframeRef   = useRef<HTMLIFrameElement>(null)
  const readyRef    = useRef(false)

  // Listen for vscode.dev ready signal
  useEffect(() => {
    function onMsg(e: MessageEvent) {
      if (e.data?.type === 'vscode-ready') readyRef.current = true
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [])

  // Tell VS Code to open file when patch is applied
  useEffect(() => {
    if (!REPO || !readyRef.current || !file || !iframeRef.current?.contentWindow) return
    iframeRef.current.contentWindow.postMessage(
      { type: 'open-file', path: file },
      'https://vscode.dev',
    )
  }, [file, showDiff])

  // ── REAL MODE ─────────────────────────────────────────────────────────────
  if (REPO) {
    const owner = REPO.replace('https://github.com/', '')
    return (
      <div className="vsc-wrap">
        <iframe
          ref={iframeRef}
          src={`https://vscode.dev/github/${owner}`}
          className="vsc-iframe"
          title="VS Code"
          allow="clipboard-read; clipboard-write"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        />
      </div>
    )
  }

  // ── DUMMY MODE ────────────────────────────────────────────────────────────
  const lines  = showDiff ? after : before
  const added  = after.filter(l => l.t === 'add').length
  const removed = after.filter(l => l.t === 'rem').length

  return (
    <div className="vsc-dummy">

      {/* ── Window chrome ── */}
      <div className="vsc-titlebar">
        <div className="vsc-traffic">
          <span className="vsc-tl vsc-close" />
          <span className="vsc-tl vsc-min" />
          <span className="vsc-tl vsc-full" />
        </div>
        <span className="vsc-winlabel">NeuralOps — Visual Studio Code</span>
        {showDiff && (
          <div className="vsc-diffbadge">
            <span className="vsc-da">+{added}</span>
            <span className="vsc-ds">/</span>
            <span className="vsc-dr">−{removed}</span>
          </div>
        )}
      </div>

      {/* ── Main layout: activity bar + sidebar + editor ── */}
      <div className="vsc-main">

        {/* Activity bar */}
        <div className="vsc-activity">
          <ActivityIcon active path="M3 7h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 17l4-4 3 3 4-5 3 3" title="Explorer" />
          <ActivityIcon path="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" title="Search" />
          <ActivityIcon path="M10 9H5a2 2 0 00-2 2v6m18-3v-3a2 2 0 00-2-2h-5M9 21V9m0 0V3m0 6h6m0 0v6m0-6V3" title="Source Control" />
          <ActivityIcon path="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" title="Run & Debug" />
          <ActivityIcon path="M4 6h16M4 10h16M4 14h16M4 18h16" title="Extensions" />
        </div>

        {/* Explorer sidebar */}
        <div className="vsc-sidebar">
          <div className="vsc-sb-section">EXPLORER</div>
          <FileTree activeFile={file} showDiff={showDiff} tier={tier} />
        </div>

        {/* Editor pane */}
        <div className="vsc-editor-area">

          {/* Tab bar */}
          <div className="vsc-tabbar">
            {file ? (
              <div className={`vsc-tab ${showDiff ? 'vsc-tab-modified' : 'vsc-tab-active'}`}>
                <span className="vsc-tab-icon">{getFileIcon(file)}</span>
                <span>{file.split('/').pop()}</span>
                {showDiff && <span className="vsc-tab-dot" />}
              </div>
            ) : (
              <div className="vsc-tab-placeholder">no file open</div>
            )}
            <div className="vsc-tabbar-spacer" />
            {showDiff && (
              <div className="vsc-tabbar-action">
                <span className="vsc-diff-label">DIFF VIEW</span>
              </div>
            )}
          </div>

          {/* Breadcrumb */}
          {file && (
            <div className="vsc-breadcrumb">
              {file.split('/').map((seg, i, arr) => (
                <span key={i} className="vsc-bc-seg">
                  <span className={i === arr.length - 1 ? 'vsc-bc-active' : 'vsc-bc-dim'}>{seg}</span>
                  {i < arr.length - 1 && <span className="vsc-bc-sep"> › </span>}
                </span>
              ))}
            </div>
          )}

          {/* Code / idle */}
          <div className="vsc-code-scroll">
            {file ? (
              <div className="vsc-code">
                {lines.map((line, i) => (
                  <CodeRow key={i} line={line} showDiff={showDiff} />
                ))}
              </div>
            ) : (
              <div className="vsc-idle">
                <svg className="vsc-idle-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="0.75">
                  <path d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>
                <p className="vsc-idle-title">Agent is monitoring</p>
                <p className="vsc-idle-sub">Files open automatically when patches are applied</p>
              </div>
            )}
          </div>

          {/* Minimap */}
          {file && <Minimap lines={lines} showDiff={showDiff} />}
        </div>
      </div>

      {/* Status bar */}
      <div className="vsc-statusbar">
        <div className="vsc-sb-left">
          <span className="vsc-sb-item vsc-sb-branch">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M11.75 2.5a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0zm.75 1.5a1.5 1.5 0 1 0-1.5-1.5c0 .546.292 1.023.727 1.287L11 4.5H9.5a1 1 0 0 0-1 1v1a1 1 0 0 1-1 1H6.268A1.5 1.5 0 1 0 6 9.25v.25h1.5A2.5 2.5 0 0 0 10 7V5.5h1l-.273.713A1.5 1.5 0 1 0 12.5 4zm-9 6a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5z"/></svg>
            main
          </span>
          {showDiff && <span className="vsc-sb-item vsc-sb-ok">✓ 0 errors</span>}
        </div>
        <div className="vsc-sb-right">
          <span className="vsc-sb-item">TypeScript</span>
          <span className="vsc-sb-item">UTF-8</span>
          <span className="vsc-sb-item">Ln {lines.length}</span>
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────────

function ActivityIcon({ path, title, active }: { path: string; title: string; active?: boolean }) {
  return (
    <div className={`vsc-act-icon${active ? ' vsc-act-active' : ''}`} title={title}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path strokeLinecap="round" strokeLinejoin="round" d={path} />
      </svg>
    </div>
  )
}

function getFileIcon(file: string) {
  if (file.endsWith('.ts') || file.endsWith('.tsx')) return '⬡'
  if (file.endsWith('.css')) return '◈'
  if (file.endsWith('.json')) return '{ }'
  return '○'
}

const FILE_TREE_ITEMS = [
  { path: 'app/page.tsx',                    depth: 2 },
  { path: 'app/layout.tsx',                  depth: 2 },
  { path: 'app/api/stream/route.ts',         depth: 3 },
  { path: 'app/api/tickets/route.ts',        depth: 3 },
  { path: 'lib/agent/classifier.ts',         depth: 3 },
  { path: 'lib/agent/l2-agent.ts',           depth: 3 },
  { path: 'lib/db/migrations/20240401.ts',   depth: 4 },
  { path: 'lib/store/tickets.ts',            depth: 3 },
]

function FileTree({ activeFile, showDiff, tier }: { activeFile: string | null; showDiff: boolean; tier?: string }) {
  return (
    <div className="file-tree">
      <div className="ft-root">
        <span className="ft-arrow">▾</span>
        <span className="ft-folder">neuralops</span>
      </div>
      {FILE_TREE_ITEMS.map(item => {
        const name    = item.path.split('/').pop()!
        const isActive = activeFile === item.path
        const isModified = isActive && showDiff
        return (
          <div
            key={item.path}
            className={`ft-item${isActive ? ' ft-active' : ''}`}
            style={{ paddingLeft: `${item.depth * 10}px` }}
          >
            <span className="ft-icon">{getFileIcon(item.path)}</span>
            <span className="ft-name">{name}</span>
            {isModified && <span className="ft-mod">M</span>}
            {isActive && tier === 'L3' && <span className="ft-warn">!</span>}
          </div>
        )
      })}
    </div>
  )
}

function CodeRow({ line, showDiff }: { line: CodeLine; showDiff: boolean }) {
  const cls =
    line.t === 'rem' ? 'cl-rem' :
    line.t === 'add' ? 'cl-add' :
    line.t === 'hl'  ? 'cl-hl'  : 'cl-normal'

  const sign = showDiff
    ? (line.t === 'rem' ? '−' : line.t === 'add' ? '+' : ' ')
    : ' '

  return (
    <div className={`code-line ${cls}`}>
      <span className="cl-ln">{line.n !== '' ? line.n : ''}</span>
      {showDiff && <span className="cl-sign">{sign}</span>}
      <span className="cl-code">{line.code}</span>
    </div>
  )
}

function Minimap({ lines, showDiff }: { lines: CodeLine[]; showDiff: boolean }) {
  return (
    <div className="vsc-minimap">
      {lines.map((line, i) => {
        const bg =
          line.t === 'rem' ? 'rgba(255,68,85,0.4)' :
          line.t === 'add' ? 'rgba(0,255,136,0.4)' :
          line.t === 'hl'  ? 'rgba(255,170,0,0.3)' : 'rgba(100,130,150,0.15)'
        return (
          <div
            key={i}
            className="mm-line"
            style={{ background: bg, width: `${Math.min(line.code.length * 1.4, 80)}%` }}
          />
        )
      })}
    </div>
  )
}
