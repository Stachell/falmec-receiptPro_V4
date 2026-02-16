/**
 * DevlogicParserService
 *
 * TypeScript client for the devlogic PDF-PARSER_V1 FastAPI server.
 * Calls http://localhost:8090/parse and maps the Python ParseResult
 * to the TypeScript ParsedInvoiceResult interface.
 *
 * Requires the parser server to be running:
 *   logicdev_PDF-Parser_V1/logicdev_API/run_server.bat
 */

import type {
  InvoiceParser,
  ParsedInvoiceResult,
  ParserWarning,
  WarningSeverity,
} from './types';
import { getDevlogicApiUrl } from './config';

const DEFAULT_UNIT_ID = 'fattura_falmec_v1';
const DEFAULT_Y_TOLERANCE = 10.0;

export async function isDevlogicServerReachable(timeoutMs: number = 3000): Promise<boolean> {
  const apiUrl = getDevlogicApiUrl();
  try {
    const response = await fetch(`${apiUrl}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(timeoutMs),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Map Python snake_case ParseResult to TypeScript camelCase ParsedInvoiceResult.
 */
function mapApiResponse(data: Record<string, unknown>, fileName: string): ParsedInvoiceResult {
  const fields = (data.header as Record<string, Record<string, unknown>>).fields ?? {};

  // Map parser warnings
  const warnings: ParserWarning[] = ((data.warnings as unknown[]) ?? []).map(
    (w: unknown) => {
      const wObj = w as Record<string, unknown>;
      return {
        code: String(wObj.code ?? ''),
        message: String(wObj.message ?? ''),
        severity: (wObj.severity ?? 'warning') as WarningSeverity,
        positionIndex: wObj.position_index != null ? Number(wObj.position_index) : undefined,
        context: wObj.context != null ? (wObj.context as Record<string, unknown>) : undefined,
      };
    }
  );

  // Append failed validation results as warnings so the workflow
  // picks them up for step status (soft-fail / failed)
  const rawValidation = (data.validation_results as unknown[]) ?? [];
  for (const vr of rawValidation) {
    const v = vr as Record<string, unknown>;
    if (!v.passed) {
      warnings.push({
        code: `VALIDATION_${String(v.rule_id ?? '').toUpperCase()}`,
        message: `[Prüfergebnis] ${v.rule_name}: ${v.message}`,
        severity: (v.severity ?? 'error') as WarningSeverity,
      });
    }
  }

  return {
    success: Boolean(data.success),
    header: {
      fatturaNumber: String(fields.document_number ?? ''),
      fatturaDate: String(fields.document_date ?? ''),
      packagesCount: fields.packages_count != null ? Number(fields.packages_count) : null,
      invoiceTotal: fields.invoice_total != null ? Number(fields.invoice_total) : undefined,
      totalQty: Number(fields.total_qty ?? 0),
      parsedPositionsCount: Number(fields.parsed_positions_count ?? 0),
      qtyValidationStatus: (fields.qty_validation_status ?? 'unknown') as 'ok' | 'mismatch' | 'unknown',
    },
    lines: ((data.lines as unknown[]) ?? []).map((l: unknown) => {
      const line = l as Record<string, unknown>;
      return {
        positionIndex: Number(line.position_index ?? 0),
        manufacturerArticleNo: String(line.manufacturer_article_no ?? ''),
        ean: String(line.ean ?? ''),
        descriptionIT: String(line.description ?? ''),
        quantityDelivered: Number(line.quantity_delivered ?? 0),
        unitPrice: Number(line.unit_price ?? 0),
        totalPrice: Number(line.total_price ?? 0),
        orderCandidates: (line.order_candidates as string[]) ?? [],
        orderCandidatesText: String(line.order_candidates_text ?? ''),
        orderStatus: (line.order_status ?? 'NO') as 'YES' | 'NO' | 'check',
        rawPositionText: line.raw_position_text != null ? String(line.raw_position_text) : undefined,
      };
    }),
    warnings,
    validationResults: rawValidation.map((vr: unknown) => {
      const v = vr as Record<string, unknown>;
      return {
        ruleId: String(v.rule_id ?? ''),
        ruleName: String(v.rule_name ?? ''),
        passed: Boolean(v.passed),
        message: String(v.message ?? ''),
        severity: (v.severity ?? 'info') as WarningSeverity,
        details: v.details != null ? (v.details as Record<string, unknown>) : undefined,
      };
    }),
    parserModule: String(data.parser_unit ?? DEFAULT_UNIT_ID),
    parsedAt: String(data.parsed_at ?? new Date().toISOString()),
    sourceFileName: fileName,
  };
}

/**
 * DevlogicParserService - implements InvoiceParser interface.
 * Delegates all parsing to the local FastAPI server.
 */
class DevlogicParserServiceClass implements InvoiceParser {
  readonly moduleId = 'devlogic_fattura_v1';
  readonly moduleName = 'logicdev_PDF-Parser (backup/server)';
  readonly version = '1.0.0';

  async canHandle(_pdfFile: File): Promise<boolean> {
    // Single parser - always handles the file
    return true;
  }

  async parseInvoice(pdfFile: File): Promise<ParsedInvoiceResult> {
    const apiUrl = getDevlogicApiUrl();

    // 1. Check server availability
    const isAvailable = await isDevlogicServerReachable();
    if (!isAvailable) {
      return this._serverUnavailableResult(pdfFile.name, apiUrl);
    }

    // 2. Send PDF to parse endpoint
    const formData = new FormData();
    formData.append('file', pdfFile);
    formData.append('unit_id', DEFAULT_UNIT_ID);
    formData.append('y_tolerance', String(DEFAULT_Y_TOLERANCE));
    formData.append('run_validation', 'true');

    let data: Record<string, unknown>;
    try {
      const res = await fetch(`${apiUrl}/parse`, {
        method: 'POST',
        body: formData,
        signal: AbortSignal.timeout(60000),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => res.statusText);
        return this._errorResult(pdfFile.name, `Server-Fehler ${res.status}: ${errText}`);
      }

      data = await res.json() as Record<string, unknown>;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return this._errorResult(pdfFile.name, `Netzwerkfehler: ${msg}`);
    }

    // 3. Map response
    return mapApiResponse(data, pdfFile.name);
  }

  private _serverUnavailableResult(fileName: string, apiUrl: string): ParsedInvoiceResult {
    return {
      success: false,
      header: {
        fatturaNumber: '',
        fatturaDate: '',
        packagesCount: null,
        totalQty: 0,
        parsedPositionsCount: 0,
        qtyValidationStatus: 'unknown',
      },
      lines: [],
      warnings: [{
        code: 'PARSER_UNAVAILABLE',
        message: `Parser-Server nicht erreichbar (${apiUrl}). Bitte starte logicdev_API\\run_server.bat und versuche es erneut.`,
        severity: 'error',
      }],
      parserModule: this.moduleId,
      parsedAt: new Date().toISOString(),
      sourceFileName: fileName,
    };
  }

  private _errorResult(fileName: string, message: string): ParsedInvoiceResult {
    return {
      success: false,
      header: {
        fatturaNumber: '',
        fatturaDate: '',
        packagesCount: null,
        totalQty: 0,
        parsedPositionsCount: 0,
        qtyValidationStatus: 'unknown',
      },
      lines: [],
      warnings: [{
        code: 'PARSE_ERROR',
        message,
        severity: 'error',
      }],
      parserModule: this.moduleId,
      parsedAt: new Date().toISOString(),
      sourceFileName: fileName,
    };
  }
}

export const devlogicParser = new DevlogicParserServiceClass();
export { DevlogicParserServiceClass as DevlogicParser };
