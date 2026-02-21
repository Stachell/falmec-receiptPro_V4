/**
 * Run 3 — Expand + FIFO Fill (CRITICAL TRANSITION)
 *
 * PROJ-23 Phase A4: Third and final pass of the 3-Run Matching Engine.
 * This is the architectural pivot point where aggregated lines become
 * individual expanded lines.
 *
 * Steps:
 *   1. EXPAND: 45 aggregated lines → ~295 individual lines (qty=1 each)
 *      - Distribute existing serialNumbers from Step 3
 *      - Distribute existing allocatedOrders from Run 1 & Run 2
 *   2. FIFO FILL: For remaining unassigned expanded lines,
 *      consume from oldest pool entries, one-by-one
 *
 * After Run 3:
 *   - store.invoiceLines = expanded lines (~295)
 *   - store.run.isExpanded = true
 *
 * @module services/matching/runs/run3ExpandFifo
 */

import type {
  InvoiceLine,
  AllocatedOrder,
  OrderAssignmentReason,
} from '@/types';
import type { OrderPool } from '../orderPool';
import { consumeFromPool } from '../orderPool';

export interface Run3Result {
  /** Expanded individual lines (qty=1 each) */
  lines: InvoiceLine[];
  /** Number of FIFO allocations made on expanded lines */
  fifoFallbackCount: number;
  /** Total number of expanded lines */
  expandedLineCount: number;
}

/**
 * Find the AllocatedOrder covering a specific expansion index.
 *
 * allocatedOrders are sequential: if orders = [{qty:7}, {qty:3}],
 * then indices 0-6 → order[0], indices 7-9 → order[1].
 */
function findOrderForIndex(
  allocatedOrders: AllocatedOrder[],
  index: number,
): AllocatedOrder | null {
  let offset = 0;
  for (const order of allocatedOrders) {
    if (index < offset + order.qty) return order;
    offset += order.qty;
  }
  return null;
}

/**
 * Expand aggregated lines to individual qty=1 lines,
 * distributing serials and pre-allocated orders.
 */
function expandAggregatedLines(
  aggregatedLines: InvoiceLine[],
  runId: string,
): InvoiceLine[] {
  const expanded: InvoiceLine[] = [];

  for (const line of aggregatedLines) {
    const qty = Math.max(1, line.qty);

    for (let i = 0; i < qty; i++) {
      // Find the allocated order covering this expansion index
      const allocOrder = findOrderForIndex(line.allocatedOrders, i);

      // Build single-element allocatedOrders array if assigned
      const singleAllocatedOrders: AllocatedOrder[] = allocOrder
        ? [{
            orderNumber: allocOrder.orderNumber,
            orderYear: allocOrder.orderYear,
            qty: 1,
            reason: allocOrder.reason,
          }]
        : [];

      // Derive order fields from the allocation
      const orderNumberAssigned = allocOrder?.orderNumber ?? null;
      const orderAssignmentReason: OrderAssignmentReason = allocOrder
        ? allocOrder.reason
        : line.orderAssignmentReason === 'not-ordered'
          ? 'not-ordered'
          : 'pending';
      const orderYear = allocOrder?.orderYear ?? null;
      const orderCode = allocOrder
        ? allocOrder.orderNumber.split('-').pop() ?? null
        : null;

      // Distribute serial number from the aggregated array
      const serialNumber = line.serialNumbers[i] ?? null;

      expanded.push({
        ...line,
        lineId: `${runId}-line-${line.positionIndex}-${i}`,
        qty: 1,
        expansionIndex: i,
        totalLineAmount: line.unitPriceInvoice, // qty=1 → total = unit
        // Serial: single serial for this expanded line
        serialNumber,
        serialNumbers: serialNumber ? [serialNumber] : [],
        serialSource: serialNumber ? line.serialSource : 'none',
        // Order: single allocation for this expanded line
        allocatedOrders: singleAllocatedOrders,
        orderNumberAssigned,
        orderAssignmentReason,
        orderYear,
        orderCode,
        orderVorgang: null,
        orderOpenQty: null,
      });
    }
  }

  return expanded;
}

/**
 * FIFO fill remaining unassigned expanded lines from the pool.
 * Groups by article, then consumes one-by-one from oldest entries.
 */
function fifoFillExpanded(
  expandedLines: InvoiceLine[],
  pool: OrderPool,
): { lines: InvoiceLine[]; fifoCount: number } {
  let fifoCount = 0;

  const result = expandedLines.map(line => {
    // Only fill lines that are still pending
    if (line.orderAssignmentReason !== 'pending') return line;

    const artNoDE = (line.falmecArticleNo ?? '').trim();
    if (!artNoDE) return line;

    const poolEntries = pool.byArticle.get(artNoDE) ?? [];

    // Find first available pool entry (oldest-first, already sorted)
    for (const entry of poolEntries) {
      if (entry.remainingQty <= 0) continue;

      consumeFromPool(pool, entry.position.id, 1);
      fifoCount++;

      const allocation: AllocatedOrder = {
        orderNumber: `${entry.position.orderYear}-${entry.position.orderNumber}`,
        orderYear: entry.position.orderYear,
        qty: 1,
        reason: 'fifo-fallback' as OrderAssignmentReason,
      };

      return {
        ...line,
        allocatedOrders: [allocation],
        orderAssignmentReason: 'fifo-fallback' as OrderAssignmentReason,
        orderNumberAssigned: allocation.orderNumber,
        orderYear: allocation.orderYear,
        orderCode: entry.position.orderNumber,
      };
    }

    // No pool entries available — mark as not-ordered
    return {
      ...line,
      orderAssignmentReason: 'not-ordered' as OrderAssignmentReason,
    };

  });

  return { lines: result, fifoCount };
}

/**
 * Run 3: Expand aggregated lines + FIFO fill remaining.
 *
 * @param aggregatedLines - Lines after Run 1 & Run 2 (aggregated, qty > 1)
 * @param pool - OrderPool with consumption state from Run 1 & Run 2
 * @param runId - Current run ID for lineId generation
 */
export function run3ExpandFifo(
  aggregatedLines: InvoiceLine[],
  pool: OrderPool,
  runId: string,
): Run3Result {
  // Step 1: Expand
  const expanded = expandAggregatedLines(aggregatedLines, runId);
  console.debug(`[Run3] Expanded ${aggregatedLines.length} aggregated → ${expanded.length} individual lines`);

  // Step 2: FIFO fill
  const { lines: filled, fifoCount } = fifoFillExpanded(expanded, pool);
  console.debug(`[Run3] FIFO filled: ${fifoCount} lines`);

  return {
    lines: filled,
    fifoFallbackCount: fifoCount,
    expandedLineCount: expanded.length,
  };
}
