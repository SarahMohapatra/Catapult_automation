# NeuralOps — Autonomous Repair Agent
**Catapult Hackathon · L1 / L2 / L3 autonomous code repair dashboard**

---

## Quick start

```bash
# 1. Install dependencies
npm install

# 2. Start dev server
npm run dev

# 3. Open in browser
open http://localhost:3000
```

That's it. The dashboard loads with dummy data and the agent simulation starts automatically.

---

## Available commands

| Command | Description |
|---|---|
| `npm run dev` | Start dev server on http://localhost:3000 |
| `npm run build` | Production build |
| `npm run start` | Run production build |
| `npm run lint` | ESLint check |

---

## File structure

```
neuralops/
│
├── app/                            # Next.js App Router
│   ├── page.tsx                    ← Main dashboard (entry point)
│   ├── layout.tsx                  ← Root layout + CSS import
│   ├── globals.css                 ← ALL styles (tokens, layout, components)
│   └── api/
│       ├── tickets/
│       │   └── route.ts            ← GET /api/tickets  · POST /api/tickets
│       └── stream/
│           └── route.ts            ← GET /api/stream?ticketId=TKT-xxxx (SSE)
│
├── components/
│   ├── layout/
│   │   └── TopBar.tsx              ← Logo + live stats header
│   ├── tickets/
│   │   ├── TicketPanel.tsx         ← Left sidebar: queue + mini stats + legend
│   │   └── TicketCard.tsx          ← Individual ticket card with progress bar
│   ├── editor/
│   │   └── VSCodeEmbed.tsx         ← VS Code Web iframe OR pixel-perfect dummy
│   └── terminal/
│       └── Terminal.tsx            ← Agent log with auto-scroll
│
├── lib/
│   ├── types/
│   │   └── index.ts                ← All TypeScript interfaces
│   ├── data/
│   │   └── tickets.ts              ← Dummy ticket data (5 tickets: L1/L2/L3)
│   └── hooks/
│       └── useAgentLoop.ts         ← Core simulation loop — drives everything
│
├── .env.local.example              ← Copy to .env.local and configure
├── next.config.js
├── tsconfig.json
└── package.json
```

---

## How the three tiers work

| Tier | Meaning | Agent action | Visual |
|------|---------|-------------|--------|
| **L1** | Simple bug, high confidence | Agent auto-fixes and commits | Green accent + "RESOLVED" |
| **L2** | Complex change, needs review | Agent fixes + flags for human review | Amber accent + "L2 REVIEW" |
| **L3** | Destructive / critical / low confidence | Agent escalates, does NOT touch code | Red accent + "HUMAN REQ" |

---

## Connecting to the real VS Code

The right panel has two modes:

### Mode 1 — Dummy (default, works now)
A pixel-perfect fake VS Code with live diff view. No setup needed.
Perfect for the demo — judges can't tell the difference.

### Mode 2 — Real VS Code Web

1. Push your repo to GitHub (public, or authenticate in browser)
2. Create `.env.local` from the example:
   ```bash
   cp .env.local.example .env.local
   ```
3. Set the repo URL:
   ```
   NEXT_PUBLIC_VSCODE_REPO=https://github.com/YOUR_ORG/neuralops
   ```
4. Restart dev server — `VSCodeEmbed.tsx` automatically loads `vscode.dev/github/YOUR_ORG/neuralops`

When the agent applies a patch, the component sends a `postMessage` to VS Code to open the file automatically. This is already wired in `VSCodeEmbed.tsx`.

---

## Connecting to your real backend

All dummy data lives in two files. Here's how to swap in real data:

### 1. Replace dummy ticket data

In `lib/hooks/useAgentLoop.ts`, the boot sequence reads from `DUMMY_TICKETS`.
When your backend exposes `GET /api/tickets`, replace the import with a fetch:

```ts
// Before (dummy):
import { DUMMY_TICKETS } from '@/lib/data/tickets'

// After (real API):
const res = await fetch('/api/tickets')
const { tickets } = await res.json()
```

### 2. Replace the setTimeout simulation with real SSE

In `useAgentLoop.ts`, the `runTicket` function uses `setTimeout` to simulate
the agent stream. When your backend exposes `GET /api/stream?ticketId=...`,
replace the timeout loop with:

```ts
const es = new EventSource(`/api/stream?ticketId=${tkt.id}`)

es.onmessage = (e) => {
  const data = JSON.parse(e.data)
  if (data.type === 'patch-applied') {
    patchTicket(tkt.id, { showDiff: true })
  } else {
    pushLine({ level: data.level, text: data.text })
  }
}

es.addEventListener('error', () => es.close())
```

### 3. Real SSE event format (for backend team)

Each event your backend emits should be:
```
data: {"level": "info", "text": "→ [classifier] scanning…"}

data: {"level": "warn", "text": "  ! TypeError at line 14"}

data: {"level": "success", "text": "✓ TKT-0048 resolved"}

data: {"type": "patch-applied", "ticketId": "TKT-0048"}
```

Valid `level` values: `"info"` `"warn"` `"success"` `"cyan"` `"dim"`

### 4. Real diff data format

When the agent applies a patch, it should return `before` and `after` arrays
in this format (already typed in `lib/types/index.ts`):

```ts
interface CodeLine {
  n: number | ''   // line number ('' for added/removed virtual lines)
  t: 'n' | 'rem' | 'add' | 'hl'  // normal / removed / added / highlighted
  code: string     // raw code string
}
```

---

## Design tokens

All colors and fonts live in `app/globals.css` as CSS variables.
To change the theme, edit the `:root` block at the top — everything cascades.

Key tokens:
- `--cyan` — primary accent (headers, active states)
- `--green` — L1 resolved / success
- `--amber` — L2 review / running / warnings
- `--red` — L3 human required / errors
- `--mono` — JetBrains Mono (all code + UI text)
- `--display` — Syne (logo only)
