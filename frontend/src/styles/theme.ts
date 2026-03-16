/**
 * Centralized Tailwind class tokens for the dark futuristic theme.
 *
 * Usage:
 *   import { theme } from '../styles/theme';
 *   <div className={theme.card}>...</div>
 *
 * All colors come from tailwind.config.ts `cyber.*` palette.
 * Never hardcode color classes outside this file — always reference theme tokens.
 */

export const theme = {
  // Layout
  page: 'min-h-screen bg-cyber-black font-mono text-cyber-text',
  container: 'max-w-4xl mx-auto px-6 py-10',

  // Cards & surfaces
  card: 'bg-cyber-card border border-cyber-border rounded-lg p-6',
  cardGlow: 'bg-cyber-card border border-cyber-cyan/30 rounded-lg p-6 shadow-cyber-sm',

  // Typography
  heading1: 'text-2xl font-bold text-cyber-cyan tracking-widest uppercase',
  heading2: 'text-lg font-semibold text-cyber-text tracking-wide uppercase',
  label: 'text-xs font-mono text-cyber-muted tracking-widest uppercase',
  mono: 'font-mono text-sm text-cyber-text',

  // Status indicators
  statusOnline: 'text-cyber-green',
  statusOffline: 'text-cyber-red',
  statusPending: 'text-cyber-cyan animate-pulse-slow',

  // Dots
  dotOnline: 'w-2 h-2 rounded-full bg-cyber-green shadow-cyber-green',
  dotOffline: 'w-2 h-2 rounded-full bg-cyber-red',
  dotPending: 'w-2 h-2 rounded-full bg-cyber-cyan animate-pulse',

  // Badges
  badgeOnline: 'px-2 py-0.5 rounded text-xs font-mono bg-cyber-green/10 text-cyber-green border border-cyber-green/30',
  badgeOffline: 'px-2 py-0.5 rounded text-xs font-mono bg-cyber-red/10 text-cyber-red border border-cyber-red/30',
  badgePending: 'px-2 py-0.5 rounded text-xs font-mono bg-cyber-cyan/10 text-cyber-cyan border border-cyber-cyan/30',

  // Dividers
  divider: 'border-t border-cyber-border my-6',

  // Buttons
  btnPrimary: 'px-4 py-2 bg-cyber-cyan/10 border border-cyber-cyan/50 text-cyber-cyan rounded font-mono text-sm hover:bg-cyber-cyan/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
  btnSecondary: 'px-4 py-2 bg-cyber-purple/10 border border-cyber-purple/50 text-cyber-purple rounded font-mono text-sm hover:bg-cyber-purple/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
  btnDanger: 'px-4 py-2 bg-cyber-red/10 border border-cyber-red/50 text-cyber-red rounded font-mono text-sm hover:bg-cyber-red/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed',

  // ─── Main layout (sidebar + content pane) ─────────────────────────────────
  appShell: 'flex h-screen bg-cyber-black font-mono overflow-hidden',

  // Sidebar
  sidebar: 'w-64 shrink-0 border-r border-cyber-border bg-cyber-dark flex flex-col overflow-hidden',
  sidebarHeader: 'px-4 py-4 border-b border-cyber-border shrink-0',
  sidebarList: 'flex-1 overflow-y-auto',
  sidebarItem: 'px-4 py-3 cursor-pointer border-b border-cyber-border/40 hover:bg-cyber-card/60 transition-colors',
  sidebarItemActive: 'px-4 py-3 cursor-pointer border-b border-cyber-border/40 bg-cyber-card border-l-2 border-l-cyber-cyan',
  sidebarItemId: 'text-xs font-mono text-cyber-muted',
  sidebarItemTitle: 'text-sm font-mono mt-0.5 text-cyber-text',
  sidebarItemTitleActive: 'text-sm font-mono mt-0.5 text-cyber-cyan',

  // Content pane (right side)
  pane: 'flex-1 flex flex-col overflow-hidden',
  paneHeader: 'px-6 py-4 border-b border-cyber-border shrink-0',
  paneBody: 'flex-1 flex flex-col p-6 gap-4 overflow-hidden min-h-0',
  paneScrollable: 'flex-1 overflow-y-auto p-6',

  // ─── Console component ────────────────────────────────────────────────────
  consoleWrap: 'flex-1 bg-cyber-dark border border-cyber-border rounded flex flex-col overflow-hidden min-h-0',
  consoleOutput: 'flex-1 font-mono text-xs p-4 overflow-y-auto',
  consolePlaceholder: 'text-cyber-muted italic',
  consoleRow: 'flex gap-3 py-0.5 leading-relaxed',
  consoleTimestamp: 'text-cyber-muted shrink-0 select-none',

  // Per log-level accent colors (level label)
  consoleLevelInfo: 'text-cyber-cyan shrink-0 select-none',
  consoleLevelSuccess: 'text-cyber-green shrink-0 select-none',
  consoleLevelError: 'text-cyber-red shrink-0 select-none',
  consoleLevelWarn: 'text-cyber-yellow shrink-0 select-none',

  // Per log-level message colors
  consoleMsgInfo: 'text-cyber-text break-all',
  consoleMsgSuccess: 'text-cyber-green break-all',
  consoleMsgError: 'text-cyber-red break-all',
  consoleMsgWarn: 'text-cyber-yellow break-all',

  // Debug log level
  consoleLevelDebug: 'text-cyber-muted shrink-0 select-none',
  consoleMsgDebug: 'text-cyber-muted break-all',

  // Debug toggle
  debugToggle: 'flex items-center gap-2 text-xs font-mono text-cyber-muted select-none cursor-pointer',
  debugToggleSwitch: 'relative w-8 h-4 rounded-full border transition-colors',
  debugToggleSwitchOff: 'bg-cyber-dark border-cyber-border',
  debugToggleSwitchOn: 'bg-cyber-purple/30 border-cyber-purple/60',
  debugToggleKnob: 'absolute top-0.5 w-3 h-3 rounded-full transition-all',
  debugToggleKnobOff: 'left-0.5 bg-cyber-muted',
  debugToggleKnobOn: 'left-[calc(100%-0.875rem)] bg-cyber-purple',
} as const;
