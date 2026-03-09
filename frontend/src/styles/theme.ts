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
  btnPrimary: 'px-4 py-2 bg-cyber-cyan/10 border border-cyber-cyan/50 text-cyber-cyan rounded font-mono text-sm hover:bg-cyber-cyan/20 transition-colors',
  btnSecondary: 'px-4 py-2 bg-cyber-purple/10 border border-cyber-purple/50 text-cyber-purple rounded font-mono text-sm hover:bg-cyber-purple/20 transition-colors',
} as const;
