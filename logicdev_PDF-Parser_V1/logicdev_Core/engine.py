"""
PDFEngine - Main orchestrator for devlogic PDF-PARSER_V1.

Responsibilities:
1. Load PDF and extract text with coordinates
2. Group text items into logical lines
3. Dispatch to selected parsing unit
4. Run post-parse validation rules
5. Return structured ParseResult
"""
import json
from pathlib import Path
from dataclasses import asdict

from .text_extraction import extract_text_from_pdf
from .line_grouper import build_grouped_lines
from .unit_loader import discover_units, list_available_units
from .validation_runner import run_validation
from .models import ParseResult, ParsedHeader, ParserWarning
import logging

logger = logging.getLogger("pdfparser.engine")

# Resolve paths relative to this file's location
_MODULE_ROOT = Path(__file__).resolve().parent.parent
_UNITS_DIR = _MODULE_ROOT / "logicdev_Pars-Units"
_RULES_DIR = _MODULE_ROOT / "logicdev_Validation-Rules"


class PDFEngine:
    """
    Core PDF parsing engine.

    Usage:
        engine = PDFEngine()
        units = engine.list_units()
        result = engine.parse("invoice.pdf", unit_id="fattura_falmec_v1")
    """

    def __init__(
        self,
        units_dir: str | Path | None = None,
        rules_dir: str | Path | None = None,
    ):
        self.units_dir = Path(units_dir) if units_dir else _UNITS_DIR
        self.rules_dir = Path(rules_dir) if rules_dir else _RULES_DIR
        self._units = None  # Lazy-loaded

    def _load_units(self):
        """Lazy-load parsing units."""
        if self._units is None:
            self._units = discover_units(self.units_dir)
        return self._units

    def list_units(self) -> list[dict]:
        """List available parsing units with metadata."""
        return list_available_units(self.units_dir)

    def parse(
        self,
        pdf_path: str | Path,
        unit_id: str,
        y_tolerance: float = 3.0,
        run_validation_rules: bool = True,
    ) -> ParseResult:
        """
        Parse a PDF using the specified parsing unit.

        Args:
            pdf_path: Path to the PDF file.
            unit_id: ID of the parsing unit to use.
            y_tolerance: Y-position tolerance for line grouping.
            run_validation_rules: Whether to run post-parse validation.

        Returns:
            ParseResult with header, lines, warnings, validation.
        """
        pdf_path = Path(pdf_path)
        logger.info(f"Parsing {pdf_path.name} with unit '{unit_id}'")

        # 1. Resolve parsing unit
        units = self._load_units()
        if unit_id not in units:
            available = ", ".join(units.keys()) or "(none)"
            return ParseResult(
                success=False,
                header=ParsedHeader(),
                lines=[],
                warnings=[ParserWarning(
                    code="UNIT_NOT_FOUND",
                    message=f"Parsing unit '{unit_id}' not found. Available: {available}",
                    severity="error",
                )],
                parser_unit=unit_id,
                source_file_name=pdf_path.name,
            )

        unit = units[unit_id]

        # 2. Extract text from PDF
        try:
            pages, raw_items, page_count = extract_text_from_pdf(pdf_path)
        except Exception as e:
            return ParseResult(
                success=False,
                header=ParsedHeader(),
                lines=[],
                warnings=[ParserWarning(
                    code="PDF_READ_ERROR",
                    message=f"Failed to read PDF: {e}",
                    severity="error",
                )],
                parser_unit=unit_id,
                source_file_name=pdf_path.name,
            )

        if not pages:
            return ParseResult(
                success=False,
                header=ParsedHeader(),
                lines=[],
                warnings=[ParserWarning(
                    code="PDF_EMPTY",
                    message="PDF contains no extractable text",
                    severity="error",
                )],
                parser_unit=unit_id,
                source_file_name=pdf_path.name,
            )

        # 3. Group items into logical lines
        grouped_lines = build_grouped_lines(raw_items, y_tolerance)

        # 4. Dispatch to parsing unit
        result = unit.parse(
            pages=pages,
            raw_items=raw_items,
            grouped_lines=grouped_lines,
            page_count=page_count,
            source_file_name=pdf_path.name,
        )

        # 5. Run validation rules
        if run_validation_rules:
            validation_results = run_validation(result, self.rules_dir)
            result.validation_results = validation_results

        logger.info(
            f"Parse complete: success={result.success}, "
            f"lines={len(result.lines)}, "
            f"warnings={len(result.warnings)}"
        )

        return result

    def parse_to_json(
        self,
        pdf_path: str | Path,
        unit_id: str,
        **kwargs,
    ) -> str:
        """Parse and return result as JSON string."""
        result = self.parse(pdf_path, unit_id, **kwargs)
        return json.dumps(asdict(result), indent=2, ensure_ascii=False)
