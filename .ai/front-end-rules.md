# Front-End Rules — Lesson Integration Guide

> **Read this before touching any frontend code.**
> These rules ensure every new lesson integrates seamlessly with the shared UI without breaking the existing design.

---

## Architecture Overview

```
frontend/src/
├── components/
│   └── Console.tsx          # Reusable log console — import, don't recreate
├── layouts/
│   └── MainLayout.tsx       # Sidebar + <Outlet> — do not modify per-lesson
├── lessons/
│   └── registry.ts          # Central lesson registry — ADD YOUR LESSON HERE
├── pages/
│   ├── HealthCheck.tsx      # [SYS] health check pane
│   └── LessonPane.tsx       # Lesson execution pane — reused for all lessons
├── styles/
│   ├── theme.ts             # Centralized Tailwind tokens — USE THIS ALWAYS
│   └── index.css            # Global styles + Tailwind directives
├── App.tsx                  # Router — nested routes under MainLayout
└── main.tsx                 # React root
```

The UI is a **fixed shell**: sidebar on the left, content pane on the right.
**Adding a new lesson requires only two steps** — no router changes, no layout edits.

---

## How to Add a New Lesson

### Step 1 — Create the lesson file

Create `frontend/src/lessons/S0XEY.ts` (or `.tsx` if you need JSX):

```typescript
import { registerLesson } from './registry.js';
import type { AddLog } from './registry.js';

async function execute(addLog: AddLog): Promise<void> {
  addLog('Fetching data from Hub API...', 'info');

  // ... your lesson logic here ...
  // Call addLog() throughout to emit progress to the Console.

  addLog('Answer submitted successfully.', 'success');
}

registerLesson({
  id: 'S01E02',                           // Must match the lesson directory name
  title: 'Short Human-Readable Title',    // Shown in sidebar and pane header
  description: 'One-line task summary.', // Optional — shown below the title
  execute,
});
```

### Step 2 — Import the lesson in `main.tsx`

Add a **side-effect import** at the top of `frontend/src/main.tsx`:

```typescript
// Lesson registrations (side-effect imports — order = sidebar order)
import './lessons/S01E01.js';
import './lessons/S01E02.js'; // ← add new lessons here
```

That's it. The lesson will appear in the sidebar and the Execute button will run it.

---

## AddLog API

`addLog` is the only way to write to the Console. Call it from your `execute` function:

```typescript
addLog('message')                   // level defaults to 'info'
addLog('message', 'info')           // cyan  — general progress
addLog('message', 'success')        // green — success, flag received
addLog('message', 'warn')           // yellow — non-fatal warning
addLog('message', 'error')          // red   — error (also thrown errors are caught)
```

The Console auto-scrolls to the latest entry. Each line shows: `HH:MM:SS [LEVEL] message`.

---

## Console Component (reusable)

`Console` can be used outside `LessonPane` if you need to show logs in a custom view:

```tsx
import { Console } from '../components/Console.js';
import type { LogEntry } from '../components/Console.js';

const [logs, setLogs] = useState<LogEntry[]>([]);

// Emit a log entry manually:
setLogs(prev => [...prev, {
  id: `${Date.now()}-${Math.random()}`,
  timestamp: new Date(),
  level: 'info',
  message: 'Hello from custom view',
}]);

// Render:
<Console logs={logs} />
```

`Console` fills its parent's available height — wrap it in a flex column container with `min-h-0` so it doesn't overflow.

---

## Styling Rules — CRITICAL

**Never hardcode Tailwind color classes in components.** Always import and use tokens from `theme.ts`:

```typescript
// ❌ WRONG
<div className="bg-[#111122] border border-[#1e2040] text-cyan-400">

// ✅ CORRECT
import { theme } from '../styles/theme.js';
<div className={theme.card}>
```

### Available theme tokens

| Token | Use for |
|---|---|
| `theme.page` | Full-page background (standalone pages only) |
| `theme.container` | Centered content wrapper |
| `theme.card` | Surface card |
| `theme.cardGlow` | Surface card with cyan glow border |
| `theme.heading1` | Page-level headings |
| `theme.heading2` | Section headings |
| `theme.label` | Uppercase small label / category text |
| `theme.mono` | Monospace body text |
| `theme.btnPrimary` | Primary action button (cyan) |
| `theme.btnSecondary` | Secondary action button (purple) |
| `theme.btnDanger` | Destructive action button (red) |
| `theme.divider` | Horizontal rule |
| `theme.statusOnline/Offline/Pending` | Status text color |
| `theme.dotOnline/Offline/Pending` | Status indicator dot |
| `theme.badgeOnline/Offline/Pending` | Status badge chip |
| `theme.appShell` | Root flex container (sidebar + pane) |
| `theme.sidebar` | Sidebar column |
| `theme.sidebarHeader` | Sidebar brand header |
| `theme.sidebarList` | Scrollable nav list |
| `theme.sidebarItem` | Nav item (inactive) |
| `theme.sidebarItemActive` | Nav item (active, left accent) |
| `theme.sidebarItemId` | Lesson id text in sidebar |
| `theme.sidebarItemTitle` | Lesson title text (inactive) |
| `theme.sidebarItemTitleActive` | Lesson title text (active) |
| `theme.pane` | Right-side content column |
| `theme.paneHeader` | Sticky pane header area |
| `theme.paneBody` | Flex column body (use for console + button layout) |
| `theme.paneScrollable` | Scrollable pane body (use for static content) |
| `theme.consoleWrap` | Console outer wrapper |
| `theme.consoleOutput` | Console scrollable output area |
| `theme.consolePlaceholder` | Placeholder text when no logs |
| `theme.consoleRow` | Single log row |
| `theme.consoleTimestamp` | Timestamp column |
| `theme.consoleLevelInfo/Success/Error/Warn` | Level label (left column) |
| `theme.consoleMsgInfo/Success/Error/Warn` | Message text |

### Adding new visual patterns

If you need a pattern not covered by existing tokens:
1. **Add it to `frontend/src/styles/theme.ts` first** (using existing `cyber.*` palette colors from `tailwind.config.ts`)
2. Then reference it via `theme.yourNewToken` in the component
3. Never add raw hex values or arbitrary Tailwind color classes to components

---

## Cyber Color Palette Reference

All colors come from `frontend/tailwind.config.ts`. Use these names in `theme.ts`:

| Class | Hex | Use |
|---|---|---|
| `cyber-black` | `#08080f` | Page background |
| `cyber-dark` | `#0d0d1a` | Secondary bg, console bg |
| `cyber-card` | `#111122` | Card surfaces, sidebar active bg |
| `cyber-border` | `#1e2040` | Borders, dividers |
| `cyber-cyan` | `#00d4ff` | Primary accent, active states, headings |
| `cyber-purple` | `#a855f7` | Secondary accent, running state |
| `cyber-green` | `#00ff9f` | Success, online status |
| `cyber-red` | `#ff4466` | Error, offline status |
| `cyber-yellow` | `#f59e0b` | Warning |
| `cyber-text` | `#e2e8f0` | Primary body text |
| `cyber-muted` | `#64748b` | Dimmed / secondary text |
| `cyber-subtle` | `#334155` | Very dimmed text or borders |

---

## Adding a New Route / Custom Page

If a lesson needs a full custom view (not just the console + execute pattern), you can add a dedicated page component and route it through `App.tsx`:

```typescript
// App.tsx — add inside the <Route element={<MainLayout />}> block:
<Route path="lessons/S02E05/custom" element={<MyCustomPane />} />
```

Custom panes should use `theme.paneHeader` + `theme.paneScrollable` (or `theme.paneBody`) as the top-level structure so they match the rest of the UI.

---

## Do Not Modify

- `MainLayout.tsx` — do not add lesson-specific logic here
- `LessonPane.tsx` — do not add lesson-specific logic here; it's shared by all lessons
- `Console.tsx` — do not add lesson-specific logic here
- `theme.ts` — only extend, never remove or rename existing tokens
- `tailwind.config.ts` — only extend the `cyber.*` palette, keep existing keys
