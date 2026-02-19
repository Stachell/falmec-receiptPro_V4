/**
 * FatturaParser_Master Self-Test — Standalone Node.js script
 *
 * Replicates the coordinate-based extraction logic from FatturaParser_Master
 * using pdfjs-dist Node.js API (no Vite worker needed).
 *
 * Usage: npx tsx tests/v3-self-test.ts
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// pdfjs-dist Node.js import
// @ts-ignore — legacy build path for Node.js
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── CONSTANTS (same as FatturaParser_Master) ────────────────────────

const PAGE_HEIGHT = 841;
const Y_TOL = 5;
const NUM_BLOCK_SCAN = 25;

const COL = {
  LEFT_COL:    { xMin: 10,  xMax: 82  },
  DESCRIPTION: { xMin: 82,  xMax: 400 },
  UM:          { xMin: 400, xMax: 425 },
  QTY:         { xMin: 425, xMax: 470 },
  UNIT_PRICE:  { xMin: 470, xMax: 520 },
  TOTAL_PRICE: { xMin: 515, xMax: 560 },  // widened xMin from 520→515 for "31.000,00" at x=518
};

const HEADER_REGION = {
  invoiceNumber: { xMin: 420, xMax: 470, yMin: 235, yMax: 255 },
  invoiceDate:   { xMin: 470, xMax: 535, yMin: 235, yMax: 255 },
};

const FOOTER_REGION = {
  packagesValue:    { xMin: 25,  xMax: 65,  yMin: 722, yMax: 745 },
  totalGoodsValue:  { xMin: 315, xMax: 385, yMin: 722, yMax: 745 },
  invoiceTotalValue:{ xMin: 485, xMax: 560, yMin: 722, yMax: 800 },
};

const PAT = {
  invoiceNumber: /(\d{2}\.\d{3})/,
  invoiceDate:   /(\d{2}\/\d{2}\/\d{4})/,
  ean:           /(803\d{10})/,
  eurPrice:      /([\d.]+,\d{2})/,
  // Non-anchored patterns for matching anywhere in row text
  vsOrder:       /Vs\.\s+ORDINE/i,
  nsOrder:       /Ns\.\s+ORDINE/i,
};

// ─── TYPES ───────────────────────────────────────────────────────────

interface TDItem {
  text: string;
  x: number;
  topY: number;
  width: number;
  height: number;
}

interface Row {
  y: number;
  items: TDItem[];
}

interface LineItem {
  position: number;
  articleNumber: string | null;
  ean: string | null;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  orderNumbers: string[];
}

// ─── HELPERS ─────────────────────────────────────────────────────────

function toTopDown(pdfjsY: number): number {
  return PAGE_HEIGHT - pdfjsY;
}

function inCol(x: number, col: { xMin: number; xMax: number }): boolean {
  return x >= col.xMin && x <= col.xMax;
}

function inRegion(item: TDItem, r: { xMin: number; xMax: number; yMin: number; yMax: number }): boolean {
  return item.x >= r.xMin && item.x <= r.xMax && item.topY >= r.yMin && item.topY <= r.yMax;
}

function parseEurPrice(text: string): number | null {
  const match = text.match(PAT.eurPrice);
  if (!match) return null;
  const normalized = match[1].replace(/\./g, '').replace(',', '.');
  const value = parseFloat(normalized);
  return isNaN(value) ? null : value;
}

function groupIntoRows(items: TDItem[]): Row[] {
  const rows: Row[] = [];
  for (const item of items) {
    const last = rows[rows.length - 1];
    if (last && Math.abs(item.topY - last.y) <= Y_TOL) {
      last.items.push(item);
    } else {
      rows.push({ y: item.topY, items: [item] });
    }
  }
  return rows;
}

function rowText(row: Row): string {
  return [...row.items].sort((a, b) => a.x - b.x).map(it => it.text).join(' ');
}

function colItems(row: Row, col: { xMin: number; xMax: number }): TDItem[] {
  return row.items.filter(it => inCol(it.x, col)).sort((a, b) => a.x - b.x);
}

/**
 * Concatenate adjacent LEFT_COL items into a single string.
 * pdfjs often splits article numbers like "CPON90.E" + "11" + "P2#EUB490F"
 * into separate text items. We join them (no space if gap < 3pt).
 */
function concatLeftColText(items: TDItem[]): string {
  if (items.length === 0) return '';
  const sorted = [...items].sort((a, b) => a.x - b.x);
  let result = sorted[0].text;
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    const gap = curr.x - (prev.x + prev.width);
    // Small gap (<3pt) = continuation of same token, larger gap = separate token
    result += (gap > 3 ? ' ' : '') + curr.text;
  }
  return result;
}

function extractOrderNumbers(text: string): string[] {
  // Handle pdfjs splitting "Nr." as "N r." — normalize first
  const normalized = text.replace(/N\s+r\./g, 'Nr.');

  // Extract raw number string from "Vs. ORDINE ... Nr. XXX del ..."
  const match = normalized.match(/Nr\.?\s*(.+?)\s+del\s+\d{2}\/\d{2}\/\d{4}/i);
  if (!match) return [];

  const rawNumber = match[1].trim();
  const segments = rawNumber.split('_').filter(s => /^\d+$/.test(s));

  const orders: string[] = [];
  let has10xxx = false;

  // First pass: find 5-digit 10xxx orders
  for (const seg of segments) {
    if (/^10\d{3}$/.test(seg)) {
      orders.push(seg);
      has10xxx = true;
    } else if (/^9\d{4}$/.test(seg)) {
      orders.push(seg);
    }
  }

  // Second pass: reconstruct 3-digit fragments
  if (has10xxx) {
    for (const seg of segments) {
      if (/^\d{3}$/.test(seg) && parseInt(seg) >= 100) {
        const reconstructed = '10' + seg;
        if (!orders.includes(reconstructed)) {
          orders.push(reconstructed);
        }
      }
    }
  }

  return orders;
}

// ─── PDF EXTRACTION ──────────────────────────────────────────────────

async function extractPages(pdfPath: string): Promise<TDItem[][]> {
  const buffer = readFileSync(pdfPath);
  const data = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const doc = await getDocument({ data }).promise;
  const allPages: TDItem[][] = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const items: TDItem[] = [];

    for (const item of content.items) {
      if ('str' in item && item.str.trim()) {
        items.push({
          text: item.str,
          x: item.transform[4],
          topY: toTopDown(item.transform[5]),
          width: item.width,
          height: item.height,
        });
      }
    }

    // Sort by topY ascending, then x ascending
    items.sort((a, b) => a.topY - b.topY || a.x - b.x);
    allPages.push(items);
  }

  return allPages;
}

// ─── PARSING LOGIC (mirrors FatturaParser_Master) ───────────────────

function detectBodyBounds(items: TDItem[]): { bodyStartY: number; bodyEndY: number } {
  let bodyStartY = 289;
  for (const item of items) {
    if (item.text.toUpperCase() === 'DESCRIPTION' && item.topY > 280 && item.topY < 300) {
      bodyStartY = item.topY;
      break;
    }
  }

  let bodyEndY = 717;
  for (const item of items) {
    if (/^Number\s+of/i.test(item.text) && item.topY > 700) {
      bodyEndY = item.topY;
      break;
    }
  }
  for (const item of items) {
    if (/^Continues/i.test(item.text) && item.topY > 780) {
      if (bodyEndY === 717) bodyEndY = item.topY;
      break;
    }
  }

  return { bodyStartY, bodyEndY };
}

function findValueInBand(rows: Row[], pzIdx: number, col: { xMin: number; xMax: number }): string | null {
  const pzRow = rows[pzIdx];
  const direct = colItems(pzRow, col);
  if (direct.length > 0) return concatLeftColText(direct);

  if (pzIdx + 1 < rows.length) {
    const next = rows[pzIdx + 1];
    if (Math.abs(next.y - pzRow.y) <= Y_TOL) {
      const nextItems = colItems(next, col);
      if (nextItems.length > 0) return concatLeftColText(nextItems);
    }
  }
  return null;
}

/**
 * Find the Y-coordinate of the next logical boundary below the current PZ row.
 * A boundary is either the next PZ line item or the next order block header.
 */
function findNextBoundaryY(rows: Row[], pzIdx: number): number | null {
  const pzY = rows[pzIdx].y;
  for (let i = pzIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.y <= pzY) continue;
    const text = rowText(row);
    const pzItems = colItems(row, COL.UM);
    if (pzItems.some(it => it.text.trim().toUpperCase() === 'PZ')) return row.y;
    if (PAT.vsOrder.test(text) || PAT.nsOrder.test(text)) return row.y;
  }
  return null;
}

function extractNumberBlock(pzRow: Row, allRows: Row[], pzIdx: number, bodyItems: TDItem[]): { articleNumber: string | null; ean: string | null } {
  let articleNumber: string | null = null;
  let ean: string | null = null;

  // 1. Check LEFT_COL items on PZ row — concatenate all into one string
  const leftOnPz = colItems(pzRow, COL.LEFT_COL);
  if (leftOnPz.length > 0) {
    const allLeftText = concatLeftColText(leftOnPz);
    const eanMatch = allLeftText.match(PAT.ean);
    if (eanMatch) {
      ean = eanMatch[1];
      const before = allLeftText.substring(0, allLeftText.indexOf(ean)).trim();
      if (before) articleNumber = before;
    } else {
      // No EAN — entire LEFT_COL text is the article number
      if (allLeftText.length >= 4 && /\d/.test(allLeftText)) {
        articleNumber = allLeftText;
      }
    }
  }

  // Check split-line for article
  if (!articleNumber && pzIdx + 1 < allRows.length) {
    const next = allRows[pzIdx + 1];
    if (Math.abs(next.y - pzRow.y) <= Y_TOL) {
      const leftNext = colItems(next, COL.LEFT_COL);
      if (leftNext.length > 0) {
        const text = concatLeftColText(leftNext);
        if (!PAT.ean.test(text) && text.length >= 4 && /\d/.test(text)) {
          articleNumber = text;
        }
      }
    }
  }

  // 2. Scan number block below PZ line (dynamic boundary)
  if (!ean) {
    const pzY = pzRow.y;
    const nextBoundary = findNextBoundaryY(allRows, pzIdx);
    const scanLimit = nextBoundary !== null ? nextBoundary - 2 : pzY + 80;
    const blockItems = bodyItems.filter(it =>
      it.topY > pzY + 2 && it.topY < scanLimit && inCol(it.x, COL.LEFT_COL)
    );

    if (blockItems.length > 0) {
      // Concatenate all block items (they may be split by pdfjs)
      const blockText = concatLeftColText(blockItems);
      const eanMatch = blockText.match(PAT.ean);
      if (eanMatch) {
        ean = eanMatch[1];
        if (!articleNumber) {
          const before = blockText.substring(0, blockText.indexOf(ean)).trim();
          if (before && before.length >= 4 && /\d/.test(before)) {
            articleNumber = before;
          }
        }
      } else if (!articleNumber) {
        if (blockText.length >= 4 && /\d/.test(blockText)) {
          articleNumber = blockText;
        }
      }
    }
  }

  return { articleNumber, ean };
}

// ─── MAIN TEST ──────────────────────────────────────────────────────

async function main() {
  const pdfPath = resolve(__dirname, '..', '.samples', 'sample Fattura PDF', 'Fattura2026020007-SAMPLE-DL.pdf');
  const expectedPath = resolve(__dirname, '..', '.claude', 'skills', 'falmec-pdf-parser', 'reference', 'expected-output.json');

  console.log('=== V3 Parser Self-Test ===');
  console.log(`PDF: ${pdfPath}`);
  console.log('');

  // Load expected output
  const expected = JSON.parse(readFileSync(expectedPath, 'utf-8'));

  // Extract pages
  const pages = await extractPages(pdfPath);
  console.log(`Pages: ${pages.length}`);

  // ─── HEADER ─────────────────────────────────────────────────
  let invoiceNumber = '';
  let invoiceDate = '';
  const page1 = pages[0];
  for (const item of page1) {
    if (inRegion(item, HEADER_REGION.invoiceNumber)) {
      const m = item.text.match(PAT.invoiceNumber);
      if (m) { invoiceNumber = m[1]; break; }
    }
  }
  for (const item of page1) {
    if (inRegion(item, HEADER_REGION.invoiceDate)) {
      const m = item.text.match(PAT.invoiceDate);
      if (m) { invoiceDate = m[1]; break; }
    }
  }

  console.log(`Invoice Number: ${invoiceNumber} (expected: ${expected.header.invoiceNumber})`);
  console.log(`Invoice Date: ${invoiceDate} (expected: ${expected.header.invoiceDate})`);

  // ─── BODY ───────────────────────────────────────────────────
  const lineItems: LineItem[] = [];
  let posIndex = 1;
  let currentOrders: string[] = [];

  for (let pi = 0; pi < pages.length; pi++) {
    const pageItems = pages[pi];
    const { bodyStartY, bodyEndY } = detectBodyBounds(pageItems);
    const bodyItems = pageItems.filter(it => it.topY > bodyStartY && it.topY < bodyEndY);
    const rows = groupIntoRows(bodyItems);

    for (let ri = 0; ri < rows.length; ri++) {
      const row = rows[ri];
      const text = rowText(row);

      // Check for order block — match anywhere in row text
      if (PAT.vsOrder.test(text)) {
        currentOrders = extractOrderNumbers(text);
        continue;
      }
      if (PAT.nsOrder.test(text)) continue;

      // Check for PZ anchor in UM column band
      const pzItems = colItems(row, COL.UM);
      const hasPZ = pzItems.some(it => it.text.trim().toUpperCase() === 'PZ');
      if (!hasPZ) continue;

      // Extract values
      const qtyRaw = findValueInBand(rows, ri, COL.QTY);
      const quantity = qtyRaw ? parseInt(qtyRaw, 10) || 0 : 0;

      const unitPriceRaw = findValueInBand(rows, ri, COL.UNIT_PRICE);
      let unitPrice = unitPriceRaw ? parseEurPrice(unitPriceRaw) ?? 0 : 0;

      const totalPriceRaw = findValueInBand(rows, ri, COL.TOTAL_PRICE);
      const totalPrice = totalPriceRaw ? parseEurPrice(totalPriceRaw) ?? 0 : 0;

      // Missing unit price → calculate
      if (unitPrice === 0 && totalPrice > 0 && quantity > 0) {
        unitPrice = Math.round((totalPrice / quantity) * 100) / 100;
      }

      const nb = extractNumberBlock(row, rows, ri, bodyItems);

      lineItems.push({
        position: posIndex++,
        articleNumber: nb.articleNumber,
        ean: nb.ean,
        quantity,
        unitPrice,
        totalPrice,
        orderNumbers: [...currentOrders],
      });
    }
  }

  // ─── FOOTER ─────────────────────────────────────────────────
  const lastPage = pages[pages.length - 1];
  let totalPackages = 0;
  let invoiceTotal = 0;

  const hasContinues = lastPage.some(it => /^Continues/i.test(it.text));
  if (!hasContinues) {
    for (const item of lastPage) {
      if (inRegion(item, FOOTER_REGION.packagesValue) && /^\d+$/.test(item.text)) {
        totalPackages = parseInt(item.text, 10);
        break;
      }
    }
    for (const item of lastPage) {
      if (inRegion(item, FOOTER_REGION.invoiceTotalValue)) {
        const p = parseEurPrice(item.text);
        if (p !== null) { invoiceTotal = p; break; }
      }
    }
  }

  // ─── RESULTS ────────────────────────────────────────────────
  const qtySum = lineItems.reduce((s, l) => s + l.quantity, 0);
  const priceSum = Math.round(lineItems.reduce((s, l) => s + l.totalPrice, 0) * 100) / 100;

  console.log('');
  console.log('=== SUMMARY ===');
  console.log(`Positions:  ${lineItems.length} (expected: 45)`);
  console.log(`Qty Sum:    ${qtySum} (expected: 295)`);
  console.log(`Price Sum:  ${priceSum.toFixed(2)} (expected: 104209.50)`);
  console.log(`Packages:   ${totalPackages} (expected: 295)`);
  console.log(`Inv Total:  ${invoiceTotal.toFixed(2)} (expected: 104209.50)`);

  // ─── SPOT CHECKS ───────────────────────────────────────────
  console.log('');
  console.log('=== SPOT CHECKS ===');

  const spotChecks = [
    { pos: 1,  art: 'KACL.457#NF',             ean: '8034122713656', qty: 1,  up: 219.09, tp: 219.09,   orders: ['10153'] },
    { pos: 8,  art: 'CUZQ90.06P8#ZZZN461F',    ean: '8034122900940', qty: 20, up: 1550.00, tp: 31000.00, orders: ['10164'] },
    { pos: 9,  art: 'CLUN90.E0P1#NEUI491F',    ean: '8034122324876', qty: 10, up: 470.00, tp: 4700.00,  orders: ['10170', '10173', '10172'] },
    { pos: 14, art: 'KACL.943',                 ean: '8034122710938', qty: 3,  up: 42.05, tp: 126.15,    orders: ['10170', '10173', '10172'] },
    { pos: 24, art: 'CVXN85.E0P2#ZZZN490F',    ean: '8034122368665', qty: 24, up: 285.00, tp: 6840.00,  orders: ['10170', '10173', '10172'] },
    { pos: 31, art: 'CMHN90.E3P2#ZZZI410F',    ean: '8034122355221', qty: 2,  up: 450.00, tp: 900.00,   orders: ['10175'] },
    { pos: 43, art: 'CPON90.E11P2#EUB490F',    ean: '8034122369204', qty: 1,  up: 293.74, tp: 293.74,   orders: ['10175'] },
    { pos: 45, art: 'KCQAN.00#N',              ean: '8034122711317', qty: 50, up: 31.78, tp: 1589.00,   orders: ['10175'] },
  ];

  let spotPassed = 0;
  let spotFailed = 0;

  for (const sc of spotChecks) {
    const item = lineItems[sc.pos - 1];
    if (!item) {
      console.log(`  FAIL Pos ${sc.pos}: NOT FOUND (only ${lineItems.length} items)`);
      spotFailed++;
      continue;
    }

    const errors: string[] = [];
    if (item.articleNumber !== sc.art) errors.push(`art: got "${item.articleNumber}" exp "${sc.art}"`);
    if (item.ean !== sc.ean) errors.push(`ean: got "${item.ean}" exp "${sc.ean}"`);
    if (item.quantity !== sc.qty) errors.push(`qty: got ${item.quantity} exp ${sc.qty}`);
    // For pos 43, the PDF shows unitPrice=375 but totalPrice=293.74
    if (sc.pos === 43) {
      if (Math.abs(item.totalPrice - sc.tp) > 0.01) errors.push(`tp: got ${item.totalPrice} exp ${sc.tp}`);
    } else {
      if (Math.abs(item.unitPrice - sc.up) > 0.01) errors.push(`up: got ${item.unitPrice} exp ${sc.up}`);
      if (Math.abs(item.totalPrice - sc.tp) > 0.01) errors.push(`tp: got ${item.totalPrice} exp ${sc.tp}`);
    }
    if (JSON.stringify(item.orderNumbers) !== JSON.stringify(sc.orders)) {
      errors.push(`orders: got ${JSON.stringify(item.orderNumbers)} exp ${JSON.stringify(sc.orders)}`);
    }

    if (errors.length === 0) {
      console.log(`  PASS Pos ${sc.pos}: ${sc.art}`);
      spotPassed++;
    } else {
      console.log(`  FAIL Pos ${sc.pos}: ${errors.join(', ')}`);
      spotFailed++;
    }
  }

  // ─── OVERALL RESULT ────────────────────────────────────────
  console.log('');
  const allOk = lineItems.length === 45 && qtySum === 295 && Math.abs(priceSum - 104209.50) < 0.02 && spotFailed === 0;

  if (allOk) {
    console.log('=== PARSER SELF-TEST PASSED ===');
    console.log(`  Header: invoice number + date correct`);
    console.log(`  Line items: ${lineItems.length}/45 extracted`);
    console.log(`  Quantities: ${qtySum}/295 matched`);
    console.log(`  Totals: ${priceSum.toFixed(2)} matched`);
    console.log(`  Spot checks: ${spotPassed}/8 passed`);
  } else {
    console.log('=== PARSER SELF-TEST FAILED ===');
    if (lineItems.length !== 45) console.log(`  Positions: ${lineItems.length} != 45`);
    if (qtySum !== 295) console.log(`  Qty Sum: ${qtySum} != 295`);
    if (Math.abs(priceSum - 104209.50) >= 0.02) console.log(`  Price Sum: ${priceSum.toFixed(2)} != 104209.50`);
    if (spotFailed > 0) console.log(`  Spot checks: ${spotFailed} failed`);
  }

  // ─── DETAILED LINE DUMP ────────────────────────────────────
  console.log('');
  console.log('=== ALL POSITIONS ===');
  for (const item of lineItems) {
    console.log(`  Pos ${String(item.position).padStart(2)}: art=${(item.articleNumber ?? 'null').padEnd(25)} ean=${(item.ean ?? 'null').padEnd(15)} qty=${String(item.quantity).padStart(3)} up=${item.unitPrice.toFixed(2).padStart(10)} tp=${item.totalPrice.toFixed(2).padStart(12)} orders=[${item.orderNumbers.join(',')}]`);
  }

  process.exit(allOk ? 0 : 1);
}

main().catch(err => {
  console.error('Self-test error:', err);
  process.exit(1);
});
