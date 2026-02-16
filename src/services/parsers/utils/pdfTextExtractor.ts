/**
 * PDF text extraction using pdfjs-dist
 * Provides coordinate-based text extraction and line grouping to simulate pdfplumber behavior
 */

import * as pdfjsLib from 'pdfjs-dist';
import type { TextItem, TextMarkedContent } from 'pdfjs-dist/types/src/display/api';

// Import worker as Vite asset (CRITICAL: Uses ?url suffix for proper bundling)
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

// Set worker source for pdfjs-dist
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

export interface ExtractedTextItem {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GroupedLine {
  y: number; // Average Y position of the line
  text: string; // Combined text of all items in the line
  items: ExtractedTextItem[]; // Individual items sorted by X position
}

export interface ExtractedPage {
  pageNumber: number;
  items: ExtractedTextItem[];
  fullText: string;
  groupedLines: GroupedLine[];
}

/**
 * Extract text with coordinates from all pages of a PDF file
 * @param file - PDF file to extract from
 * @param yTolerance - Y-coordinate tolerance for line grouping (default: 10)
 * @returns Array of extracted pages with text and coordinates
 */
export async function extractTextFromPDF(
  file: File,
  yTolerance: number = 10
): Promise<ExtractedPage[]> {
  // Check if worker is configured
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    console.error('[PDF Extractor] Worker not configured!');
    throw new Error('pdfjs-dist worker not configured! Cannot extract PDF text.');
  }

  // Load PDF file
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });

  // Add progress logging
  loadingTask.onProgress = (progress: { loaded: number; total: number }) => {
    console.log(`[PDF Loader] ${progress.loaded}/${progress.total} bytes`);
  };

  const pdf = await loadingTask.promise;
  console.log(`[PDF Loader] ✓ Successfully loaded PDF with ${pdf.numPages} pages`);

  const pages: ExtractedPage[] = [];

  // Extract text from each page
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();

    // Extract items with coordinates
    const items: ExtractedTextItem[] = [];
    for (const item of textContent.items) {
      if ('str' in item && (item as TextItem).str.trim()) {
        const textItem = item as TextItem;
        const x = textItem.transform[4];
        const y = textItem.transform[5];

        // Validate coordinates
        if (typeof x !== 'number' || typeof y !== 'number' || isNaN(x) || isNaN(y)) {
          console.warn(`[PDF Extractor] Invalid coordinates for text "${textItem.str}": x=${x}, y=${y}`);
          continue;
        }

        items.push({
          text: textItem.str,
          x,
          y,
          width: textItem.width,
          height: textItem.height,
        });
      }
    }

    console.log(`[PDF Extractor] Page ${pageNum}: ${items.length} text items extracted`);

    // Warn if no items found
    if (items.length === 0) {
      console.warn(`[PDF Extractor] Page ${pageNum}: No text items found! Worker may not be initialized correctly.`);
    }

    // Sort items by Y position (top to bottom), then X position (left to right)
    // Note: pdfjs uses bottom-up Y coordinates (higher Y = higher on page)
    items.sort((a, b) => {
      const yDiff = b.y - a.y; // Descending Y (top first)
      if (Math.abs(yDiff) > yTolerance) return yDiff;
      return a.x - b.x; // Ascending X (left first)
    });

    // Group items into lines
    const groupedLines = groupTextByLine(items, yTolerance);
    console.log(`[PDF Extractor] Page ${pageNum}: ${groupedLines.length} lines grouped`);

    // Generate full page text
    const fullText = groupedLines.map(line => line.text).join('\n');

    pages.push({
      pageNumber: pageNum,
      items,
      fullText,
      groupedLines,
    });
  }

  return pages;
}

/**
 * Group text items into lines based on Y-coordinate clustering
 * Simulates pdfplumber's y_tolerance behavior
 *
 * @param items - Text items with coordinates
 * @param yTolerance - Maximum Y difference for items to be considered on same line
 * @returns Array of grouped lines
 */
export function groupTextByLine(
  items: ExtractedTextItem[],
  yTolerance: number = 10
): GroupedLine[] {
  if (items.length === 0) return [];

  const lines: GroupedLine[] = [];
  let currentLine: ExtractedTextItem[] = [];
  let currentY: number | null = null;

  for (const item of items) {
    if (currentY === null) {
      // Start first line
      currentY = item.y;
      currentLine.push(item);
    } else if (Math.abs(item.y - currentY) <= yTolerance) {
      // Same line (within tolerance)
      currentLine.push(item);
    } else {
      // New line - finalize current line
      if (currentLine.length > 0) {
        lines.push(finalizeLine(currentLine));
      }
      currentLine = [item];
      currentY = item.y;
    }
  }

  // Add last line
  if (currentLine.length > 0) {
    lines.push(finalizeLine(currentLine));
  }

  return lines;
}

/**
 * Finalize a grouped line by sorting items by X position and combining text
 * @param items - Items in the line
 * @returns Grouped line object
 */
function finalizeLine(items: ExtractedTextItem[]): GroupedLine {
  // Sort items by X position (left to right)
  items.sort((a, b) => a.x - b.x);

  // Calculate average Y position
  const avgY = items.reduce((sum, item) => sum + item.y, 0) / items.length;

  // Combine text with spaces (smart spacing based on X gaps)
  let combinedText = '';
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (i === 0) {
      combinedText = item.text;
    } else {
      const prevItem = items[i - 1];
      const gap = item.x - (prevItem.x + prevItem.width);

      // Add space if gap is significant (> 5 pixels)
      if (gap > 5) {
        combinedText += ' ' + item.text;
      } else {
        combinedText += item.text;
      }
    }
  }

  return {
    y: avgY,
    text: combinedText,
    items: [...items],
  };
}

/**
 * Get text from a specific line index
 * @param groupedLines - Array of grouped lines
 * @param index - Line index
 * @returns Line text or empty string if out of bounds
 */
export function getLineText(groupedLines: GroupedLine[], index: number): string {
  return groupedLines[index]?.text || '';
}

/**
 * Search for a pattern in grouped lines and return matching lines with context
 * @param groupedLines - Array of grouped lines
 * @param pattern - Regex pattern to search for
 * @param contextBefore - Number of lines before match to include
 * @param contextAfter - Number of lines after match to include
 * @returns Array of matches with context
 */
export function searchLinesWithContext(
  groupedLines: GroupedLine[],
  pattern: RegExp,
  contextBefore: number = 0,
  contextAfter: number = 0
): Array<{ index: number; line: string; context: string[] }> {
  const matches: Array<{ index: number; line: string; context: string[] }> = [];

  for (let i = 0; i < groupedLines.length; i++) {
    const line = groupedLines[i].text;
    if (pattern.test(line)) {
      const contextLines: string[] = [];

      // Add lines before
      for (let j = Math.max(0, i - contextBefore); j < i; j++) {
        contextLines.push(groupedLines[j].text);
      }

      // Add lines after
      for (let j = i + 1; j <= Math.min(groupedLines.length - 1, i + contextAfter); j++) {
        contextLines.push(groupedLines[j].text);
      }

      matches.push({
        index: i,
        line,
        context: contextLines,
      });
    }
  }

  return matches;
}
