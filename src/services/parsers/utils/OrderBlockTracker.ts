/**
 * Tracks order references (Vs. ORDINE) throughout PDF parsing
 *
 * CRITICAL BEHAVIOR: Order references persist across multiple invoice positions
 * until a new order block is encountered. This matches the PDF structure where
 * "Vs. ORDINE Nr. 10153" applies to all following positions until a new order appears.
 */
export class OrderBlockTracker {
  private currentOrders: string[] = [];

  /**
   * Start a new order block with given order references
   * @param orderReferences - Array of order numbers (e.g., ["10153", "10154"])
   */
  startNewBlock(orderReferences: string[]): void {
    this.currentOrders = orderReferences.filter(o => o.trim().length > 0);
  }

  /**
   * Get current order references for the current position
   * @returns Copy of current orders array (does NOT reset after retrieval)
   *
   * IMPORTANT: Returns a copy to prevent external modification.
   * Orders persist until startNewBlock() is called again.
   */
  getOrdersForPosition(): string[] {
    return [...this.currentOrders];
  }

  /**
   * Check if there are any active orders
   */
  hasOrders(): boolean {
    return this.currentOrders.length > 0;
  }

  /**
   * Reset tracker (typically at start of new PDF parsing)
   */
  reset(): void {
    this.currentOrders = [];
  }

  /**
   * Get current order count for debugging
   */
  getCurrentOrderCount(): number {
    return this.currentOrders.length;
  }
}

/**
 * Extract order references from a line containing "Vs. ORDINE"
 * @param line - Line containing order reference(s)
 * @returns Array of order numbers
 * @example
 * extractOrderReferences("Vs. ORDINE Nr. 10153") // Returns: ["10153"]
 * extractOrderReferences("Vs. ORDINE 0_10170_173_172") // Returns: ["10170", "173", "172"]
 */
export function extractOrderReferences(line: string): string[] {
  const candidates: string[] = [];

  // Underscore format, e.g. "0_10170_173_172" -> 10170, 10173, 10172
  const underscoreMatch = line.match(/(\d+(?:_\d+)+)/);
  if (underscoreMatch) {
    const parts = underscoreMatch[1].split('_');
    let basePrefix = '';
    for (const part of parts) {
      if (part.length === 5 && part.startsWith('10')) {
        candidates.push(part);
        basePrefix = part.slice(0, 2);
      } else if (part.length === 3 && basePrefix) {
        candidates.push(basePrefix + part);
      }
    }
  }

  // Standalone 10xxx numbers
  const standaloneMatches = line.match(/\b(10\d{3})\b/g) ?? [];
  for (const order of standaloneMatches) {
    if (!candidates.includes(order)) {
      candidates.push(order);
    }
  }

  return candidates;
}
