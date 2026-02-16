/**
 * Fattura PDF Parser Service
 * Ported from Python parser (logicdev_PDF-Parser_V1/logicdev_Pars-Units/fattura_falmec_v1.py)
 *
 * Pure TypeScript implementation using pdfjs-dist for PDF text extraction.
 * No server dependency required.
 */

import { logService } from '../logService';
import type {
  InvoiceParser,
  ParsedInvoiceResult,
  ParsedInvoiceHeader,
  ParsedInvoiceLine,
  ParserWarning,
} from './types';
import {
  extractTextFromPDF,
  groupTextByLine,
  type ExtractedPage,
  type GroupedLine,
} from './utils/pdfTextExtractor';
import { OrderBlockTracker, extractOrderReferences } from './utils/OrderBlockTracker';
import { parsePrice, parseIntSafe, extractTwoPrices } from './utils/priceParser';
import {
  INVOICE_NUMBER_PATTERNS,
  ARTICLE_PATTERNS,
  EAN_PATTERN,
  PRICE_LINE_PATTERN,
  PARTIAL_PZ_PATTERN,
  PRICE_VALUE_PATTERN,
  FATTURA_DATE,
  PACKAGES_COUNT,
  PACKAGES_COUNT_ALT,
  CONTRIBUTO_MARKER,
  AMOUNT_TO_PAY_MARKER,
  shouldSkipLine,
  isOrderReferenceLine,
} from './constants/fatturaPatterns';

interface PriceData {
  qty: number;
  unitPrice: number;
  totalPrice: number;
}

interface FullPriceMatch extends PriceData {
  startIndex: number;
  endIndex: number;
}

interface ParseLinesResult {
  lines: ParsedInvoiceLine[];
  warnings: ParserWarning[];
}

interface ParseCandidateResult extends ParseLinesResult {
  tolerance: number;
  totalQty: number;
  score: number;
  pages: ExtractedPage[];
}

export class FatturaParserService implements InvoiceParser {
  readonly moduleId = 'logicdev_pdf_parser_integrated_v1';
  readonly moduleName = 'logicdev_PDF-Parser';
  readonly version = '1.0.0';

  private orderTracker = new OrderBlockTracker();

  async parseInvoice(pdfFile: File): Promise<ParsedInvoiceResult> {
    const runId = `run_${Date.now()}`;
    const startTime = Date.now();

    logService.info(`PDF-Parsing gestartet: ${pdfFile.name}`, {
      runId,
      step: 'Rechnung auslesen',
      details: `Dateigroesse: ${(pdfFile.size / 1024).toFixed(2)} KB`,
    });

    try {
      const pages = await extractTextFromPDF(pdfFile, 10);
      logService.info(`${pages.length} Seiten extrahiert`, { runId });

      const header = this.parseHeader(pages[0], runId);
      const packagesCountFromLastPage = this.parsePackagesCount(pages[pages.length - 1], runId);
      if (packagesCountFromLastPage > 0) {
        header.packagesCount = packagesCountFromLastPage;
      }
      const parsedLines = this.parseLinesAdaptive(pages, runId, header.packagesCount);
      const lines = parsedLines.lines;

      const invoiceTotal = this.parseInvoiceTotal(parsedLines.pages[parsedLines.pages.length - 1], runId);
      if (invoiceTotal > 0) {
        header.invoiceTotal = invoiceTotal;
      }

      header.totalQty = lines.reduce((sum, line) => sum + line.quantityDelivered, 0);
      header.parsedPositionsCount = lines.length;
      header.qtyValidationStatus =
        header.packagesCount && header.totalQty === header.packagesCount
          ? 'ok'
          : header.packagesCount
            ? 'mismatch'
            : 'unknown';

      const warnings: ParserWarning[] = [...parsedLines.warnings];
      if (!header.fatturaNumber) {
        warnings.push({
          code: 'MISSING_FATTURA_NUMBER',
          message: 'Rechnungsnummer konnte nicht extrahiert werden',
          severity: 'error',
        });
      }

      const duration = Date.now() - startTime;
      logService.info(`PDF-Parsing abgeschlossen (${duration}ms): ${lines.length} Positionen`, {
        runId,
        details: `RgNr: ${header.fatturaNumber || 'N/A'}, Datum: ${header.fatturaDate || 'N/A'}`,
      });

      return {
        success: warnings.filter((w) => w.severity === 'error').length === 0,
        header,
        lines,
        warnings,
        parserModule: this.moduleId,
        parsedAt: new Date().toISOString(),
        sourceFileName: pdfFile.name,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logService.error(`PDF-Parsing fehlgeschlagen: ${errorMsg}`, {
        runId,
        details: error instanceof Error ? error.stack : undefined,
      });
      throw new Error(`PDF-Parsing fehlgeschlagen: ${errorMsg}`);
    }
  }

  private parseHeader(firstPage: ExtractedPage, runId: string): ParsedInvoiceHeader {
    const fullText = firstPage.fullText;
    const groupedLines = firstPage.groupedLines;

    let invoiceNumber = '';
    for (const { name, regex } of INVOICE_NUMBER_PATTERNS) {
      const match = fullText.match(regex);
      if (match) {
        invoiceNumber = name === 'FATTURA_NUMBER_FLEXIBLE' ? `${match[1]}.${match[2]}` : match[1];
        logService.info(`Rechnungsnummer gefunden: ${invoiceNumber} (Muster: ${name})`, {
          runId,
          step: 'Header',
        });
        break;
      }
    }

    if (!invoiceNumber) {
      const snippet = fullText.slice(0, 200).replace(/\n/g, ' ');
      logService.warn(
        `Rechnungsnummer nicht gefunden. ${INVOICE_NUMBER_PATTERNS.length} Muster versucht. Text: ${snippet}`,
        { runId, step: 'Header' }
      );
    }

    let date = '';
    const dateMatch = fullText.match(FATTURA_DATE);
    if (dateMatch) {
      date = dateMatch[1].replace(/\//g, '.');
      logService.info(`Datum gefunden: ${date}`, { runId, step: 'Header' });
    }

    let packagesCount = 0;
    let packMatch = fullText.match(PACKAGES_COUNT);
    if (packMatch) {
      packagesCount = parseIntSafe(packMatch[1]);
    }

    if (packagesCount === 0) {
      for (let i = 0; i < groupedLines.length; i++) {
        const line = groupedLines[i].text;
        if (/Number\s+of\s+packages/i.test(line)) {
          for (let j = i + 1; j < Math.min(i + 3, groupedLines.length); j++) {
            const numMatch = groupedLines[j].text.match(/(\d{1,3})/);
            if (numMatch) {
              packagesCount = parseIntSafe(numMatch[1]);
              break;
            }
          }
          break;
        }
      }
    }

    if (packagesCount === 0) {
      packMatch = fullText.match(PACKAGES_COUNT_ALT);
      if (packMatch) {
        packagesCount = parseIntSafe(packMatch[1]);
      }
    }

    if (packagesCount > 0) {
      logService.info(`Paketzahl gefunden: ${packagesCount}`, { runId, step: 'Header' });
    }

    return {
      fatturaNumber: invoiceNumber,
      fatturaDate: date,
      packagesCount: packagesCount || null,
      invoiceTotal: 0,
      totalQty: 0,
      parsedPositionsCount: 0,
      qtyValidationStatus: 'unknown',
    };
  }

  private parseLinesAdaptive(
    pages: ExtractedPage[],
    runId: string,
    packagesCount: number | null
  ): ParseCandidateResult {
    const tolerances = [10, 8, 6, 4];
    let best: ParseCandidateResult | null = null;

    for (const tolerance of tolerances) {
      const candidatePages = this.rebuildPagesForTolerance(pages, tolerance);
      const result = this.parseLines(candidatePages, runId);
      const totalQty = result.lines.reduce((sum, line) => sum + line.quantityDelivered, 0);
      const score = this.scoreParseCandidate(result, packagesCount, totalQty);
      const missingIdentifierCount = result.warnings.filter(
        (warning) => warning.code === 'POSITION_MISSING_IDENTIFIER'
      ).length;

      const candidate: ParseCandidateResult = {
        ...result,
        tolerance,
        totalQty,
        score,
        pages: candidatePages,
      };

      if (!best || this.isBetterCandidate(candidate, best)) {
        best = candidate;
      }

      logService.debug(
        `Adaptive Kandidat yTolerance=${tolerance}: Positionen=${result.lines.length}, Gesamtmenge=${totalQty}, MissingIdentifier=${missingIdentifierCount}, Score=${score}`,
        { runId, step: 'Position' }
      );
    }

    if (!best) {
      return {
        lines: [],
        warnings: [],
        tolerance: 10,
        totalQty: 0,
        score: Number.NEGATIVE_INFINITY,
        pages,
      };
    }

    logService.info(
      `Adaptive Parsing: yTolerance=${best.tolerance}, Positionen=${best.lines.length}, Gesamtmenge=${best.totalQty}`,
      { runId, step: 'Position' }
    );

    return best;
  }

  private rebuildPagesForTolerance(pages: ExtractedPage[], tolerance: number): ExtractedPage[] {
    if (tolerance === 10) {
      return pages;
    }

    return pages.map((page) => {
      const groupedLines = groupTextByLine(page.items, tolerance);
      return {
        ...page,
        groupedLines,
        fullText: groupedLines.map((line) => line.text).join('\n'),
      };
    });
  }

  private scoreParseCandidate(
    result: ParseLinesResult,
    packagesCount: number | null,
    totalQty: number
  ): number {
    const lineCount = result.lines.length;
    if (lineCount === 0) return Number.NEGATIVE_INFINITY;

    const missingIdentifierCount = result.warnings.filter(
      (warning) => warning.code === 'POSITION_MISSING_IDENTIFIER'
    ).length;
    const identifiedCount = lineCount - missingIdentifierCount;

    let score = lineCount * 100 - missingIdentifierCount * 5 + identifiedCount * 2;

    if (packagesCount && packagesCount > 0) {
      const diff = Math.abs(totalQty - packagesCount);
      score -= diff * 1000;
      if (diff === 0) {
        score += 5000;
      }
    }

    return score;
  }

  private isBetterCandidate(candidate: ParseCandidateResult, currentBest: ParseCandidateResult): boolean {
    if (candidate.score !== currentBest.score) {
      return candidate.score > currentBest.score;
    }

    if (candidate.lines.length !== currentBest.lines.length) {
      return candidate.lines.length > currentBest.lines.length;
    }

    const candidateMissing = candidate.warnings.filter(
      (warning) => warning.code === 'POSITION_MISSING_IDENTIFIER'
    ).length;
    const bestMissing = currentBest.warnings.filter(
      (warning) => warning.code === 'POSITION_MISSING_IDENTIFIER'
    ).length;

    if (candidateMissing !== bestMissing) {
      return candidateMissing < bestMissing;
    }

    return candidate.totalQty > currentBest.totalQty;
  }

  private parseLines(pages: ExtractedPage[], runId: string): ParseLinesResult {
    const lines: ParsedInvoiceLine[] = [];
    const warnings: ParserWarning[] = [];
    this.orderTracker.reset();

    let positionIndex = 0;
    let currentArticle = '';
    let currentEan = '';

    logService.info(`Starting position parsing for ${pages.length} pages`, {
      runId,
      step: 'Position',
    });

    for (const page of pages) {
      const groupedLines = page.groupedLines;
      logService.info(`Page ${page.pageNumber}: ${groupedLines.length} lines to process`, {
        runId,
        step: 'Position',
      });

      if (groupedLines.length === 0) {
        logService.warn(`Page ${page.pageNumber}: No lines found - text extraction may have failed`, {
          runId,
          step: 'Position',
        });
        continue;
      }

      for (let i = 0; i < groupedLines.length; i++) {
        const line = groupedLines[i];
        const text = line.text.trim();
        if (!text) continue;

        if (isOrderReferenceLine(text)) {
          const orders = extractOrderReferences(text);
          if (orders.length > 0) {
            this.orderTracker.startNewBlock(orders);
            logService.debug(`Neue Bestellung(en) gefunden: ${orders.join(', ')}`, {
              runId,
              step: 'Position',
            });
          }
          continue;
        }

        const skipOnlyHeaderFooter =
          shouldSkipLine(text) &&
          !PRICE_LINE_PATTERN.test(text) &&
          !PARTIAL_PZ_PATTERN.test(text) &&
          !this.extractEAN(text) &&
          !this.extractArticleFromText(text);
        if (skipOnlyHeaderFooter) continue;

        const combinedMatch = ARTICLE_PATTERNS[0]?.regex.exec(text);
        if (combinedMatch) {
          currentArticle = combinedMatch[1] || currentArticle;
          currentEan = combinedMatch[2] || currentEan;
        }

        const leftItems = line.items.filter((item) => item.x < 100);
        for (const item of leftItems) {
          const itemText = item.text.trim();
          if (!itemText) continue;
          const article = this.extractArticleNumber(itemText);
          if (article && itemText.includes('#')) {
            currentArticle = article;
          }
          const ean = this.extractEAN(itemText);
          if (ean) {
            currentEan = ean;
          }
        }

        for (const item of line.items) {
          const itemText = item.text.trim();
          if (!itemText) continue;

          const article = this.extractArticleNumber(itemText);
          if (article && !currentArticle) {
            currentArticle = article;
          }

          const ean = this.extractEAN(itemText);
          if (ean && !currentEan) {
            currentEan = ean;
          }

          if (!currentArticle && (/^\d{9}$/.test(itemText) || /^\d{8}F#\d{2}$/i.test(itemText))) {
            currentArticle = itemText;
          }
        }

        if (
          currentEan &&
          !currentArticle &&
          !PRICE_LINE_PATTERN.test(text) &&
          !PARTIAL_PZ_PATTERN.test(text) &&
          lines.length > 0 &&
          !lines[lines.length - 1].ean
        ) {
          lines[lines.length - 1].ean = currentEan;
          logService.debug(
            `Trailing EAN ${currentEan} zu Position ${lines[lines.length - 1].positionIndex} zugewiesen`,
            { runId, step: 'Position' }
          );
          currentEan = '';
        }

        const fullPriceMatches = this.extractFullPriceMatches(text);
        if (fullPriceMatches.length > 0) {
          let segmentStart = 0;
          let pendingArticle = currentArticle;
          let pendingEan = currentEan;

          for (const match of fullPriceMatches) {
            const segment = text.slice(segmentStart, match.endIndex);
            const article = pendingArticle || this.extractArticleFromText(segment);
            const ean = pendingEan || this.extractEAN(segment) || '';

            positionIndex = this.appendParsedPosition(
              lines,
              warnings,
              positionIndex,
              article,
              ean,
              this.extractDescription(segment),
              match,
              segment,
              runId
            );

            segmentStart = match.endIndex;
            pendingArticle = '';
            pendingEan = '';
          }

          currentArticle = '';
          currentEan = '';
          continue;
        }

        const partialPriceData = this.extractPartialPriceData(text, groupedLines, i);
        if (!partialPriceData) continue;

        positionIndex = this.appendParsedPosition(
          lines,
          warnings,
          positionIndex,
          currentArticle,
          currentEan,
          this.extractDescription(text),
          partialPriceData,
          text,
          runId
        );

        currentArticle = '';
        currentEan = '';
      }
    }

    if (currentArticle || currentEan) {
      warnings.push({
        code: 'INCOMPLETE_POSITION',
        message: `Unvollstaendige Position am Ende: Art=${currentArticle || 'N/A'}, EAN=${currentEan || 'N/A'}`,
        severity: 'warning',
      });
    }

    if (lines.length === 0) {
      const fallbackLines = this.parsePositionsFallback(pages, runId);
      if (fallbackLines.length > 0) {
        lines.push(...fallbackLines);
        warnings.push({
          code: 'FALLBACK_PARSING',
          message: `Fallback-Parsing verwendet: ${fallbackLines.length} Position(en) ohne Order-Assignment`,
          severity: 'warning',
        });
      }
    }

    if (lines.length === 0) {
      warnings.push({
        code: 'NO_POSITIONS_FOUND',
        message: 'Keine Rechnungspositionen gefunden',
        severity: 'error',
      });
    }

    logService.info(`${lines.length} Positionen extrahiert`, { runId, step: 'Position' });
    return { lines, warnings };
  }

  private buildParsedLine(
    positionIndex: number,
    article: string,
    ean: string,
    descriptionIT: string,
    priceData: PriceData,
    rawPositionText: string
  ): ParsedInvoiceLine {
    const orderCandidates = this.orderTracker.getOrdersForPosition();
    const orderStatus: 'YES' | 'NO' | 'check' =
      orderCandidates.length === 1 ? 'YES' : orderCandidates.length === 0 ? 'NO' : 'check';

    return {
      positionIndex,
      manufacturerArticleNo: article,
      ean,
      descriptionIT,
      quantityDelivered: priceData.qty,
      unitPrice: priceData.unitPrice,
      totalPrice: priceData.totalPrice,
      orderCandidates,
      orderCandidatesText: orderCandidates.join('|'),
      orderStatus,
      rawPositionText,
    };
  }

  private appendParsedPosition(
    lines: ParsedInvoiceLine[],
    warnings: ParserWarning[],
    currentPositionIndex: number,
    article: string,
    ean: string,
    descriptionIT: string,
    priceData: PriceData,
    rawText: string,
    runId: string
  ): number {
    const nextPositionIndex = currentPositionIndex + 1;
    const parsedLine = this.buildParsedLine(
      nextPositionIndex,
      article,
      ean,
      descriptionIT,
      priceData,
      rawText
    );
    lines.push(parsedLine);

    if (!parsedLine.manufacturerArticleNo && !parsedLine.ean) {
      warnings.push({
        code: 'POSITION_MISSING_IDENTIFIER',
        message: `Position ${nextPositionIndex}: Keine Artikelnummer oder EAN erkannt`,
        severity: 'warning',
        positionIndex: nextPositionIndex,
      });
    }

    logService.debug(
      `Position ${nextPositionIndex}: ${parsedLine.manufacturerArticleNo || 'N/A'}, EAN=${parsedLine.ean || 'N/A'}, Menge=${priceData.qty}, Bestellungen=[${parsedLine.orderCandidates.join(',')}]`,
      { runId, step: 'Position' }
    );

    return nextPositionIndex;
  }

  private extractArticleNumber(text: string): string | null {
    const trimmed = text.trim();
    if (!trimmed) return null;

    const ean = this.extractEAN(trimmed);
    const candidates = [trimmed];
    if (ean) {
      const withoutEan = trimmed.replace(ean, '').trim();
      if (withoutEan) {
        candidates.push(withoutEan);
      }
    }

    for (const candidate of candidates) {
      for (const { regex } of ARTICLE_PATTERNS) {
        const match = candidate.match(regex);
        if (match && this.isLikelyArticle(match[1])) {
          return match[1];
        }
      }
    }

    return null;
  }

  private extractArticleFromText(text: string): string {
    const direct = this.extractArticleNumber(text);
    if (direct) {
      return direct;
    }

    const tokens = text
      .split(/\s+/)
      .map((token) => token.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9.#-]+$/g, ''))
      .filter(Boolean);

    for (const token of tokens) {
      const article = this.extractArticleNumber(token);
      if (article) {
        return article;
      }
    }

    return '';
  }

  private isLikelyArticle(article: string): boolean {
    if (/^\d{9}$/.test(article) || /^\d{8}F#\d{2}$/i.test(article)) {
      return true;
    }

    if (/^K[A-Z]{3,4}\.\d+$/i.test(article) || /^C[A-Z]{2,3}\d{2}\./i.test(article)) {
      return true;
    }

    if (!article.includes('#')) {
      return false;
    }

    const prefix = article.split('#')[0] ?? '';
    if (prefix.includes('.')) {
      return true;
    }

    return prefix.length >= 5;
  }

  private extractEAN(text: string): string | null {
    const strictMatch = text.match(EAN_PATTERN);
    if (strictMatch) {
      return strictMatch[1];
    }

    const inlineMatch = text.match(/\b(803\d{10})\b/);
    return inlineMatch ? inlineMatch[1] : null;
  }

  private extractFullPriceMatches(currentLine: string): FullPriceMatch[] {
    const pattern = new RegExp(PRICE_LINE_PATTERN.source, 'g');
    const matches: FullPriceMatch[] = [];

    let match: RegExpExecArray | null;
    while ((match = pattern.exec(currentLine)) !== null) {
      matches.push({
        qty: parseIntSafe(match[1]),
        unitPrice: parsePrice(match[2]),
        totalPrice: parsePrice(match[3]),
        startIndex: match.index,
        endIndex: match.index + match[0].length,
      });
    }

    return matches;
  }

  private extractPartialPriceData(
    currentLine: string,
    allLines: GroupedLine[],
    currentIndex: number
  ): PriceData | null {
    const partialMatch = currentLine.match(PARTIAL_PZ_PATTERN);
    if (!partialMatch) return null;

    const qty = parseIntSafe(partialMatch[1]);
    const prices: number[] = [];

    const directPrices = currentLine.match(new RegExp(PRICE_VALUE_PATTERN.source, 'g')) ?? [];
    for (const price of directPrices) {
      const parsed = parsePrice(price);
      if (parsed > 0) prices.push(parsed);
    }

    if (prices.length < 2) {
      for (let offset = 1; offset <= 3 && currentIndex + offset < allLines.length; offset++) {
        const nextLine = allLines[currentIndex + offset].text.trim();
        if (shouldSkipLine(nextLine) || isOrderReferenceLine(nextLine) || PARTIAL_PZ_PATTERN.test(nextLine)) {
          break;
        }

        const lookaheadPrices = extractTwoPrices(nextLine);
        if (lookaheadPrices) {
          prices.push(lookaheadPrices[0], lookaheadPrices[1]);
        } else {
          const candidates = nextLine.match(new RegExp(PRICE_VALUE_PATTERN.source, 'g')) ?? [];
          for (const candidate of candidates) {
            const parsed = parsePrice(candidate);
            if (parsed > 0) prices.push(parsed);
          }
        }

        if (prices.length >= 2) break;
      }
    }

    if (prices.length === 0) return null;

    return {
      qty,
      unitPrice: prices.length >= 2 ? prices[prices.length - 2] : prices[0],
      totalPrice: prices[prices.length - 1],
    };
  }

  private extractDescription(text: string): string {
    const match = text.match(/^(.+?)\s+PZ\s+\d+/i);
    return match ? match[1].trim() : '';
  }

  private parsePositionsFallback(pages: ExtractedPage[], runId: string): ParsedInvoiceLine[] {
    const fullText = pages
      .map((page) => `${page.items.map((item) => item.text).join(' ')}\n${page.fullText}`)
      .join('\n');

    const pattern =
      /([A-Z]{2,}[A-Z0-9.]+#[A-Z0-9]+)\s*(803\d{10})[\s\S]{0,120}?PZ\s+(\d+)\s+([\d.,]+)\s+([\d.,]+)/gi;

    const lines: ParsedInvoiceLine[] = [];
    let positionIndex = 0;

    for (const match of fullText.matchAll(pattern)) {
      positionIndex += 1;
      lines.push({
        positionIndex,
        manufacturerArticleNo: match[1] || '',
        ean: match[2] || '',
        descriptionIT: '',
        quantityDelivered: parseIntSafe(match[3]),
        unitPrice: parsePrice(match[4]),
        totalPrice: parsePrice(match[5]),
        orderCandidates: [],
        orderCandidatesText: '',
        orderStatus: 'NO',
        rawPositionText: match[0],
      });
    }

    if (lines.length > 0) {
      logService.info(`Fallback-Scan erfolgreich: ${lines.length} Positionen`, {
        runId,
        step: 'Position',
      });
    }

    return lines;
  }

  private parseInvoiceTotal(lastPage: ExtractedPage, runId: string): number {
    const groupedLines = lastPage.groupedLines;
    let total = 0;

    for (let i = 0; i < groupedLines.length; i++) {
      const line = groupedLines[i].text;
      if (CONTRIBUTO_MARKER.test(line) && i > 0) {
        const prevLine = groupedLines[i - 1].text;
        const priceMatch = prevLine.match(PRICE_VALUE_PATTERN);
        if (priceMatch) {
          total = parsePrice(priceMatch[0]);
          logService.info(`Rechnungssumme gefunden (bei CONTRIBUTO): ${total}`, {
            runId,
            step: 'Total',
          });
          return total;
        }
      }
    }

    for (let i = 0; i < groupedLines.length; i++) {
      const line = groupedLines[i].text;
      if (AMOUNT_TO_PAY_MARKER.test(line)) {
        for (let j = i + 1; j < Math.min(i + 3, groupedLines.length); j++) {
          const nextLine = groupedLines[j].text;
          const priceMatch = nextLine.match(PRICE_VALUE_PATTERN);
          if (priceMatch) {
            total = parsePrice(priceMatch[0]);
            logService.info(`Rechnungssumme gefunden (bei AMOUNT TO PAY): ${total}`, {
              runId,
              step: 'Total',
            });
            return total;
          }
        }
      }
    }

    if (total === 0) {
      logService.warn('Rechnungssumme nicht gefunden', { runId, step: 'Total' });
    }

    return total;
  }

  private parsePackagesCount(page: ExtractedPage, runId: string): number {
    const fullText = page.fullText;
    const groupedLines = page.groupedLines;

    let packagesCount = 0;
    let packMatch = fullText.match(PACKAGES_COUNT);
    if (packMatch) {
      packagesCount = parseIntSafe(packMatch[1]);
    }

    if (packagesCount === 0) {
      for (let i = 0; i < groupedLines.length; i++) {
        const line = groupedLines[i].text;
        if (/Number\s+of\s+packages/i.test(line)) {
          for (let j = i + 1; j < Math.min(i + 3, groupedLines.length); j++) {
            const numMatch = groupedLines[j].text.match(/(\d{1,3})/);
            if (numMatch) {
              packagesCount = parseIntSafe(numMatch[1]);
              break;
            }
          }
          break;
        }
      }
    }

    if (packagesCount === 0) {
      packMatch = fullText.match(PACKAGES_COUNT_ALT);
      if (packMatch) {
        packagesCount = parseIntSafe(packMatch[1]);
      }
    }

    if (packagesCount > 0) {
      logService.info(`Paketzahl (letzte Seite) gefunden: ${packagesCount}`, {
        runId,
        step: 'Header',
      });
    }

    return packagesCount;
  }
}
