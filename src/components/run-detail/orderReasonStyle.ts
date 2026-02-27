/**
 * orderReasonStyle.ts — PROJ-32
 *
 * Record-based helper mapping OrderAssignmentReason → Tailwind pill classes.
 * Pattern follows StatusCheckbox.tsx STATUS_CONFIG.
 *
 * IMPORTANT: pillClass contains NO font-size — that is merged separately
 * via cn(reasonStyle.pillClass, orderZoomClass) in the consuming component.
 */

import type { OrderAssignmentReason } from '@/types';

export interface OrderReasonStyle {
  /** bg + text + rounded-l-full + font-mono (NO font-size!) */
  pillClass: string;
  /** Pencil-icon colour matching the pill background */
  iconClass: string;
  /** German tooltip label */
  label: string;
}

const STYLE_MAP: Record<OrderAssignmentReason, OrderReasonStyle> = {
  // ── Teal (Erfolg) ──
  'perfect-match': {
    pillClass: 'rounded-l-full pl-1.5 pr-1 font-mono bg-primary text-primary-foreground',
    iconClass: 'text-primary-foreground/70',
    label: 'Perfekter Match',
  },
  'direct-match': {
    pillClass: 'rounded-l-full pl-1.5 pr-1 font-mono bg-primary text-primary-foreground',
    iconClass: 'text-primary-foreground/70',
    label: 'Direkter Match',
  },
  'exact-qty-match': {
    pillClass: 'rounded-l-full pl-1.5 pr-1 font-mono bg-primary text-primary-foreground',
    iconClass: 'text-primary-foreground/70',
    label: 'Exakter Mengen-Match',
  },
  'manual-ok': {
    pillClass: 'rounded-l-full pl-1.5 pr-1 font-mono bg-primary text-primary-foreground',
    iconClass: 'text-primary-foreground/70',
    label: 'Manuell bestätigt',
  },

  // ── Blau (Sekundär) ──
  'reference-match': {
    pillClass: 'rounded-l-full pl-1.5 pr-1 font-mono bg-blue-600 text-white',
    iconClass: 'text-white/70',
    label: 'Referenz-Match',
  },
  'smart-qty-match': {
    pillClass: 'rounded-l-full pl-1.5 pr-1 font-mono bg-blue-600 text-white',
    iconClass: 'text-white/70',
    label: 'Smart-Qty-Match',
  },

  // ── Amber (Fallback) ──
  'oldest-first': {
    pillClass: 'rounded-l-full pl-1.5 pr-1 font-mono bg-amber-500 text-amber-950',
    iconClass: 'text-amber-950/70',
    label: 'Älteste zuerst (Fallback)',
  },
  'fifo-fallback': {
    pillClass: 'rounded-l-full pl-1.5 pr-1 font-mono bg-amber-500 text-amber-950',
    iconClass: 'text-amber-950/70',
    label: 'FIFO-Fallback',
  },

  // ── Violett (Manuell) ──
  manual: {
    pillClass: 'rounded-l-full pl-1.5 pr-1 font-mono bg-violet-600 text-white',
    iconClass: 'text-white/70',
    label: 'Manuell zugewiesen',
  },

  // ── Grau (Ausstehend) ──
  pending: {
    pillClass: 'rounded-l-full pl-1.5 pr-1 font-mono bg-gray-400 text-gray-900',
    iconClass: 'text-gray-900/70',
    label: 'Ausstehend',
  },

  // ── Rot (Nicht bestellt) ──
  'not-ordered': {
    pillClass: 'rounded-l-full pl-1.5 pr-1 font-mono bg-destructive text-destructive-foreground',
    iconClass: 'text-destructive-foreground/70',
    label: 'Nicht bestellt',
  },
};

export function getOrderReasonStyle(reason: OrderAssignmentReason): OrderReasonStyle {
  return STYLE_MAP[reason] ?? STYLE_MAP.pending;
}
