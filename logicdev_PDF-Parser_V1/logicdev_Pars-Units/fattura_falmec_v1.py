"""
Fattura Falmec Parsing Unit v1.0

Parses Falmec S.p.A. invoice PDFs (Fattura layout).
Ported from: FatturaParserV3 (TypeScript)
  - src/services/parslogic/modules/fattura/parser.ts
  - src/services/parslogic/modules/fattura/config.ts
"""
import re
import sys
from pathlib import Path

# Resolve imports
_root_dir = Path(__file__).resolve().parent.parent
if str(_root_dir) not in sys.path:
    sys.path.insert(0, str(_root_dir))

from _base_unit import BaseParsingUnit
from logicdev_Core.models import (
    ParseResult,
    ParsedHeader,
    ParsedLine,
    ParserWarning,
    RawTextItem,
    GroupedLine,
)
from logicdev_Core.price_parser import parse_price, parse_integer
from logicdev_Core.order_block_tracker import (
    OrderBlockTracker,
    extract_order_candidates,
    get_order_status,
    ORDER_REFERENCE_PATTERN,
)

import logging

logger = logging.getLogger("pdfparser.fattura")


# ============================================================
# CONFIGURATION (ported from config.ts)
# ============================================================

# Article number patterns, ordered by specificity (most specific first)
ARTICLE_PATTERNS = [
    # Combined article + EAN: "KACL.457#NF 8034122713656"
    ("combined", re.compile(
        r'([A-Z]{2,}[A-Z0-9.]+#[A-Z0-9]+)\s+(803\d{10})', re.IGNORECASE)),
    # Standard Falmec format: KACL.457#NF, CAEI20.E0P2#ZZZB461F
    ("standard_hash", re.compile(
        r'^([A-Z]{2,}[A-Z0-9.]+#[A-Z0-9]+)$', re.IGNORECASE)),
    # K-prefix with hash: KCVJN.00#3
    ("k_prefix_hash", re.compile(
        r'^(K[A-Z]{3,4}\.\d+#\d*)$', re.IGNORECASE)),
    # K-prefix without hash: KACL.936
    ("k_prefix_simple", re.compile(
        r'^(K[A-Z]{3,4}\.\d+)$', re.IGNORECASE)),
    # C-prefix complex: CAEI20.E0P2#ZZZB461F
    ("c_prefix", re.compile(
        r'^(C[A-Z]{2,3}\d{2}\.[A-Z0-9]+#[A-Z0-9]+)$', re.IGNORECASE)),
    # 9-digit numeric: 105080365
    ("numeric_9", re.compile(r'^(\d{9})$')),
    # 8-digit with F#xx suffix: 30506073F#49
    ("numeric_f_suffix", re.compile(
        r'^(\d{8}F#\d{2})$', re.IGNORECASE)),
    # General alphanumeric with hash (must contain hash or dot, at least 6 chars)
    ("general_hash", re.compile(
        r'^([A-Z][A-Z0-9.#\-]{4,}[A-Z0-9])$', re.IGNORECASE)),
]

# EAN pattern (13-digit starting with 803)
EAN_PATTERN = re.compile(r'^(803\d{10})$')

# Price line: "description PZ [qty] [unit_price] [total_price]"
PRICE_LINE_PATTERN = re.compile(r'PZ\s+(\d+)\s+([\d.,]+)\s+([\d.,]+)')

# Partial PZ pattern (quantity only, prices may be on next line)
PARTIAL_PZ_PATTERN = re.compile(r'PZ\s+(\d+)(?:\s|$)')

# Price value pattern (European format: 894,45 or 1.234,56)
PRICE_VALUE_PATTERN = re.compile(r'([\d]{1,3}(?:[.,]\d{3})*[.,]\d{2})')

# Header patterns for Fattura number extraction (ordered by specificity)
FATTURA_NUMBER_ALT = re.compile(
    r'NUMERO\s*DOC[^0-9]*(\d{2}\.\d{3})', re.IGNORECASE)
FATTURA_NUMBER = re.compile(r'\b(\d{2}\.\d{3})\b')
FATTURA_NUMBER_FALLBACK = re.compile(
    r'N[°o]?\s*(\d{2}\.\d{3})', re.IGNORECASE)
# Flexible patterns for whitespace variations and no-dot formats
FATTURA_NUMBER_FLEXIBLE = re.compile(r'(\d{2})\s*\.\s*(\d{3})')
FATTURA_NUMBER_NO_DOT = re.compile(
    r'NUMERO\s*DOC[^0-9]*(\d{8,10})(?!\d)', re.IGNORECASE)

# Date pattern: DD/MM/YYYY
FATTURA_DATE = re.compile(r'(\d{2}/\d{2}/\d{4})')

# Packages count
PACKAGES_COUNT = re.compile(
    r'Number\s+of\s+packages\s*[\n\s]*(\d+)', re.IGNORECASE)
PACKAGES_COUNT_ALT = re.compile(
    r'Number\s+of\s+packages[\s\S]{0,50}?(\d{2,3})', re.IGNORECASE)

# Invoice total marker (line above "CONTRIBUTO AMBIENTALE" on last page)
CONTRIBUTO_MARKER = re.compile(r'CONTRIBUTO\s+AMBIENTALE', re.IGNORECASE)
AMOUNT_TO_PAY_MARKER = re.compile(r'AMOUNT\s+.*TO\s+PAY', re.IGNORECASE)

# Header/footer content to skip
SKIP_PATTERNS = [
    re.compile(r'^INVOICE', re.IGNORECASE),
    re.compile(r'^Falmec', re.IGNORECASE),
    re.compile(r'^NUMERO', re.IGNORECASE),
    re.compile(r'^DATA', re.IGNORECASE),
    re.compile(r'^DESCRIPTION', re.IGNORECASE),
    re.compile(r'^Continues', re.IGNORECASE),
    re.compile(r'^EUR$', re.IGNORECASE),
    re.compile(r'^TOTAL', re.IGNORECASE),
    re.compile(r'^Number of packages', re.IGNORECASE),
    re.compile(r'^EXPIRY', re.IGNORECASE),
    re.compile(r'^Informativa', re.IGNORECASE),
    re.compile(r'^CUSTOMER', re.IGNORECASE),
    re.compile(r'^DESTINATARIO', re.IGNORECASE),
    re.compile(r'^Net weight', re.IGNORECASE),
    re.compile(r'^Gross weight', re.IGNORECASE),
]


def should_skip_line(text: str) -> bool:
    """Check if text matches any skip pattern (header/footer)."""
    return any(p.search(text) for p in SKIP_PATTERNS)


def match_article_number(text: str) -> str | None:
    """Try to match article number against all patterns."""
    trimmed = text.strip()
    for _name, pattern in ARTICLE_PATTERNS:
        m = pattern.search(trimmed)
        if m:
            return m.group(1)
    return None


# ============================================================
# PARSING UNIT CLASS
# ============================================================

class FatturaFalmecV1(BaseParsingUnit):
    """
    Falmec Fattura invoice parser.

    Improvements ported from FatturaParserV3:
    - Correct order block tracking (orders persist until new block)
    - 8 article number patterns ordered by specificity
    - Lookahead for split PZ/price lines
    - Full-text fallback when position parsing fails
    """

    unit_id = "fattura_falmec_v1"
    unit_name = "Falmec Fattura Parser"
    version = "1.0.0"
    description = "Parses Falmec S.p.A. invoice PDFs (Fattura layout)"

    def can_handle(self, pages: list[str]) -> bool:
        """Auto-detect Falmec invoices by looking for signature text."""
        full_text = "\n".join(pages)
        has_falmec = bool(
            re.search(r'Falmec\s+S\.?p\.?A', full_text, re.IGNORECASE))
        has_numero = bool(
            re.search(r'NUMERO\s*DOC', full_text, re.IGNORECASE))
        return has_falmec or has_numero

    def parse(
        self,
        pages: list[str],
        raw_items: list[RawTextItem],
        grouped_lines: list[GroupedLine],
        page_count: int,
        source_file_name: str = "",
    ) -> ParseResult:
        warnings: list[ParserWarning] = []
        lines: list[ParsedLine] = []
        header = ParsedHeader(fields={})

        if not pages:
            warnings.append(ParserWarning(
                code="PDF_EMPTY",
                message="PDF contains no extractable text",
                severity="error",
            ))
            return ParseResult(
                success=False, header=header, lines=lines,
                warnings=warnings, parser_unit=self.unit_id,
                source_file_name=source_file_name,
            )

        # Parse header from first page
        self._parse_header(pages[0], header, warnings)

        # Parse packages count and invoice total from last page
        self._parse_packages_count(pages[-1], header, warnings)
        self._parse_invoice_total(pages[-1], header, warnings)

        # Parse positions using grouped lines (y_tolerance=10 for Fattura)
        self._parse_positions(grouped_lines, raw_items, lines, warnings)

        # Calculate totals
        sum_qty = sum(line.quantity_delivered for line in lines)
        header.fields["total_qty"] = sum_qty
        header.fields["parsed_positions_count"] = len(lines)

        # Qty validation
        if lines and sum_qty > 0:
            if len(lines) > sum_qty:
                header.fields["qty_validation_status"] = "mismatch"
                warnings.append(ParserWarning(
                    code="POSITIONS_EXCEED_QTY",
                    message=f"Positions ({len(lines)}) > Sum Q.TY ({sum_qty})",
                    severity="warning",
                ))
            else:
                header.fields["qty_validation_status"] = "ok"
        else:
            header.fields["qty_validation_status"] = "unknown"

        success = self._validate_results(header, lines, warnings)

        logger.debug(
            f"Parsing complete: success={success}, "
            f"fattura={header.fields.get('document_number')}, "
            f"positions={len(lines)}, totalQty={sum_qty}"
        )

        return ParseResult(
            success=success,
            header=header,
            lines=lines,
            warnings=warnings,
            parser_unit=self.unit_id,
            source_file_name=source_file_name,
        )

    # ----------------------------------------------------------
    # Header parsing
    # ----------------------------------------------------------

    def _parse_header(
        self,
        page_text: str,
        header: ParsedHeader,
        warnings: list[ParserWarning],
    ) -> None:
        """Extract invoice number and date from first page."""
        # Fattura number (try 5 patterns in order of specificity)
        patterns = [
            ("FATTURA_NUMBER_ALT", FATTURA_NUMBER_ALT, 1),
            ("FATTURA_NUMBER", FATTURA_NUMBER, 1),
            ("FATTURA_NUMBER_FALLBACK", FATTURA_NUMBER_FALLBACK, 1),
            ("FATTURA_NUMBER_FLEXIBLE", FATTURA_NUMBER_FLEXIBLE, None),  # Special handling
            ("FATTURA_NUMBER_NO_DOT", FATTURA_NUMBER_NO_DOT, 1),
        ]

        found = False
        for pattern_name, pattern, group_idx in patterns:
            m = pattern.search(page_text)
            if m:
                if pattern_name == "FATTURA_NUMBER_FLEXIBLE":
                    # Combine two groups: "20" + "007" -> "20.007"
                    invoice_num = f"{m.group(1)}.{m.group(2)}"
                else:
                    invoice_num = m.group(group_idx)

                header.fields["document_number"] = invoice_num
                logger.info(f"✓ Found Fattura number: {invoice_num} (pattern: {pattern_name})")
                found = True
                break

        if not found:
            snippet = page_text[:200].replace('\n', ' ')
            logger.warning(f"✗ Failed to extract invoice number. Tried {len(patterns)} patterns. Text snippet: {snippet}")
            warnings.append(ParserWarning(
                code="MISSING_FATTURA_NUMBER",
                message="Could not extract invoice number",
                severity="error",
                context={"text_snippet": snippet}
            ))

        # Date (DD/MM/YYYY -> DD.MM.YYYY)
        dm = FATTURA_DATE.search(page_text)
        if dm:
            header.fields["document_date"] = dm.group(1).replace("/", ".")
            logger.info(f"✓ Found date: {header.fields['document_date']}")
        else:
            warnings.append(ParserWarning(
                code="MISSING_FATTURA_DATE",
                message="Could not extract invoice date",
                severity="warning",
            ))

    def _parse_packages_count(
        self,
        page_text: str,
        header: ParsedHeader,
        warnings: list[ParserWarning],
    ) -> None:
        """Extract packages count from last page."""
        # Try direct pattern first
        m = PACKAGES_COUNT.search(page_text)
        if m:
            header.fields["packages_count"] = parse_integer(m.group(1))
            logger.debug(f"Found packages count: {m.group(1)}")
            return

        # pdfplumber often puts header and values on separate lines.
        # Find "Number of packages" line, then take first number from next line.
        text_lines = page_text.split("\n")
        for i, line in enumerate(text_lines):
            if re.search(r'Number\s+of\s+packages', line, re.IGNORECASE):
                # Look at next line for the first integer
                if i + 1 < len(text_lines):
                    num_match = re.match(r'\s*(\d+)', text_lines[i + 1])
                    if num_match:
                        header.fields["packages_count"] = parse_integer(
                            num_match.group(1)
                        )
                        logger.debug(
                            f"Found packages count (next line): "
                            f"{num_match.group(1)}"
                        )
                        return

        # Last fallback with wider range
        m = PACKAGES_COUNT_ALT.search(page_text)
        if m:
            header.fields["packages_count"] = parse_integer(m.group(1))
        else:
            warnings.append(ParserWarning(
                code="MISSING_PACKAGES_COUNT",
                message="Could not extract packages count",
                severity="info",
            ))

    def _parse_invoice_total(
        self,
        page_text: str,
        header: ParsedHeader,
        warnings: list[ParserWarning],
    ) -> None:
        """Extract invoice total (TOTAL EUR) from last page.

        Strategy: Find 'CONTRIBUTO AMBIENTALE' line, take price from line above.
        Fallback: Find 'AMOUNT TO PAY' line, take price from following lines.
        """
        text_lines = page_text.split("\n")

        # Primary: line just above "CONTRIBUTO AMBIENTALE"
        for i, line in enumerate(text_lines):
            if CONTRIBUTO_MARKER.search(line):
                if i > 0:
                    prev_line = text_lines[i - 1]
                    price_m = PRICE_VALUE_PATTERN.search(prev_line)
                    if price_m:
                        header.fields["invoice_total"] = parse_price(
                            price_m.group(1)
                        )
                        logger.debug(
                            f"Found invoice total (above CONTRIBUTO): "
                            f"{price_m.group(1)}"
                        )
                        return

        # Fallback: line(s) after "AMOUNT TO PAY"
        for i, line in enumerate(text_lines):
            if AMOUNT_TO_PAY_MARKER.search(line):
                # Check next 2 lines for a standalone price
                for offset in range(1, 3):
                    if i + offset < len(text_lines):
                        next_line = text_lines[i + offset].strip()
                        price_m = PRICE_VALUE_PATTERN.search(next_line)
                        if price_m:
                            header.fields["invoice_total"] = parse_price(
                                price_m.group(1)
                            )
                            logger.debug(
                                f"Found invoice total (after AMOUNT TO PAY): "
                                f"{price_m.group(1)}"
                            )
                            return

        warnings.append(ParserWarning(
            code="MISSING_INVOICE_TOTAL",
            message="Could not extract invoice total (TOTAL EUR)",
            severity="warning",
        ))

    # ----------------------------------------------------------
    # Position parsing (CRITICAL - main parsing logic)
    # ----------------------------------------------------------

    def _parse_positions(
        self,
        grouped_lines: list[GroupedLine],
        raw_items: list[RawTextItem],
        lines: list[ParsedLine],
        warnings: list[ParserWarning],
    ) -> None:
        """
        Parse positions with correct order block tracking.

        Port of FatturaParserV3.parsePositions() (parser.ts lines 244-464).
        CRITICAL: Order numbers persist in blocks until a new "Vs. ORDINE" appears.
        Uses lookahead to combine partial PZ lines with prices from next lines.
        """
        block_tracker = OrderBlockTracker()
        position_index = 0

        # Accumulator for current position being built
        current_article = ""
        current_ean = ""

        for line_idx, gline in enumerate(grouped_lines):
            trimmed = gline.text

            # Skip header/footer content
            if should_skip_line(trimmed):
                continue

            # Check for order reference - START NEW BLOCK
            if ORDER_REFERENCE_PATTERN.search(trimmed):
                candidates = extract_order_candidates(trimmed)
                if candidates:
                    block_tracker.start_new_block(candidates)
                    logger.debug(f"New order block: {candidates}")
                continue

            # Check for combined article + EAN: "KACL.457#NF 8034122713656"
            # NOTE: Do NOT continue here - pdfplumber may merge article+EAN
            # with PZ+prices on the same line. Fall through to PZ check.
            combined_name, combined_pat = ARTICLE_PATTERNS[0]  # "combined"
            cm = combined_pat.search(trimmed)
            if cm:
                current_article = cm.group(1)
                current_ean = cm.group(2)

            # Check left-column items (x < 100) for article code / EAN
            left_items = [i for i in gline.items if i.x < 100]
            for item in left_items:
                text = item.text.strip()

                # Check for article number (must contain #)
                art = match_article_number(text)
                if art and "#" in text:
                    current_article = art

                # Check for EAN
                if EAN_PATTERN.match(text):
                    current_ean = text

            # Also check all items for standalone EAN or numeric articles
            for item in gline.items:
                text = item.text.strip()

                # EAN - associate with current position if we don't have one
                if EAN_PATTERN.match(text) and not current_ean:
                    current_ean = text

                # Numeric article patterns
                if not current_article:
                    if re.match(r'^\d{9}$', text):
                        current_article = text
                    elif re.match(r'^\d{8}F#\d{2}$', text, re.IGNORECASE):
                        current_article = text

            # TRAILING EAN: If we just collected an EAN without a new article,
            # and the last committed position has no EAN, assign retroactively.
            # This handles cases where pdfplumber puts the EAN on a line AFTER
            # the PZ line that committed the position (e.g. KCQAN.00#N).
            if (current_ean and not current_article
                    and not PRICE_LINE_PATTERN.search(trimmed)
                    and not PARTIAL_PZ_PATTERN.search(trimmed)
                    and lines and not lines[-1].ean):
                lines[-1].ean = current_ean
                logger.debug(
                    f"Trailing EAN assigned to position "
                    f"{lines[-1].position_index}: {current_ean}"
                )
                current_ean = ""

            # Check for complete price line with PZ
            price_m = PRICE_LINE_PATTERN.search(trimmed)
            if price_m:
                qty = parse_integer(price_m.group(1))
                unit_price = parse_price(price_m.group(2))
                total_price = parse_price(price_m.group(3))

                # Extract description (text before PZ)
                desc = ""
                desc_m = re.match(r'^(.+?)\s+PZ\s+\d+', trimmed)
                if desc_m:
                    desc = desc_m.group(1)

                # Every price line creates a position
                position_index += 1
                self._commit_position(
                    lines, position_index, current_article, current_ean,
                    desc, block_tracker, qty, unit_price, total_price, trimmed,
                )

                # Reset accumulators for next position
                current_article = ""
                current_ean = ""
            else:
                # FALLBACK: Check for partial PZ pattern ("PZ [qty]" without prices)
                partial_m = PARTIAL_PZ_PATTERN.search(trimmed)
                if partial_m:
                    qty = parse_integer(partial_m.group(1))

                    # Try to find prices in current line
                    prices = [
                        parse_price(m.group(1))
                        for m in PRICE_VALUE_PATTERN.finditer(trimmed)
                        if parse_price(m.group(1)) > 0
                    ]

                    # Lookahead for prices on next lines (up to 3)
                    if len(prices) < 2:
                        for look in range(1, 4):
                            if line_idx + look >= len(grouped_lines):
                                break
                            next_text = grouped_lines[line_idx + look].text
                            # Stop at header/footer, order ref, or new PZ line
                            if (should_skip_line(next_text)
                                    or ORDER_REFERENCE_PATTERN.search(next_text)):
                                break
                            if PARTIAL_PZ_PATTERN.search(next_text):
                                break
                            for m in PRICE_VALUE_PATTERN.finditer(next_text):
                                val = parse_price(m.group(1))
                                if val > 0:
                                    prices.append(val)
                            if len(prices) >= 2:
                                break

                    # If we have at least one price, create position
                    if prices:
                        unit_price = (
                            prices[-2] if len(prices) >= 2 else prices[0]
                        )
                        total_price = prices[-1]

                        desc = ""
                        desc_m = re.match(
                            r'^(.+?)(?:\s+PZ\s+\d+|\s+[\d.,]+)', trimmed)
                        if desc_m:
                            desc = desc_m.group(1)

                        position_index += 1
                        self._commit_position(
                            lines, position_index, current_article,
                            current_ean, desc, block_tracker, qty,
                            unit_price, total_price, trimmed,
                        )

                        current_article = ""
                        current_ean = ""

        # Handle remaining accumulated data (position without price)
        if current_article or current_ean:
            warnings.append(ParserWarning(
                code="INCOMPLETE_POSITION",
                message=(
                    f"Incomplete position at end: "
                    f"Art={current_article}, EAN={current_ean}"
                ),
                severity="warning",
            ))

        # Fallback if no positions found
        if not lines:
            logger.debug("No positions found, trying fallback scan...")
            self._parse_positions_fallback(raw_items, lines, warnings)

        if not lines:
            warnings.append(ParserWarning(
                code="NO_POSITIONS_FOUND",
                message="No invoice positions found",
                severity="error",
            ))
        else:
            logger.debug(f"Found {len(lines)} positions")

    # ----------------------------------------------------------
    # Commit position
    # ----------------------------------------------------------

    def _commit_position(
        self,
        lines: list[ParsedLine],
        position_index: int,
        article_no: str,
        ean: str,
        description: str,
        block_tracker: OrderBlockTracker,
        qty: int,
        unit_price: float,
        total_price: float,
        raw_text: str,
    ) -> None:
        """Commit a parsed position to the lines list."""
        # CRITICAL: Get orders from block tracker - these persist across positions!
        orders = block_tracker.get_orders_for_position()

        lines.append(ParsedLine(
            position_index=position_index,
            manufacturer_article_no=article_no,
            ean=ean,
            description=description,
            quantity_delivered=qty,
            unit_price=unit_price,
            total_price=total_price,
            order_candidates=orders.raw,
            order_candidates_text="|".join(orders.raw),
            order_status=get_order_status(orders.raw),
            raw_position_text=raw_text,
        ))

        logger.debug(
            f"Position {position_index}: art={article_no}, "
            f"ean={ean}, qty={qty}, orders={orders.raw}"
        )

    # ----------------------------------------------------------
    # Fallback: full-text scan
    # ----------------------------------------------------------

    def _parse_positions_fallback(
        self,
        raw_items: list[RawTextItem],
        lines: list[ParsedLine],
        warnings: list[ParserWarning],
    ) -> None:
        """Fallback: scan concatenated text for article+EAN+PZ blocks."""
        full_text = " ".join(i.text for i in raw_items)
        pattern = re.compile(
            r'([A-Z]{2,}[A-Z0-9.]+#[A-Z0-9]+)\s+(803\d{10})'
            r'[^P]*PZ\s+(\d+)\s+([\d.,]+)\s+([\d.,]+)',
            re.IGNORECASE,
        )

        idx = 0
        for m in pattern.finditer(full_text):
            idx += 1
            lines.append(ParsedLine(
                position_index=idx,
                manufacturer_article_no=m.group(1),
                ean=m.group(2),
                quantity_delivered=parse_integer(m.group(3)),
                unit_price=parse_price(m.group(4)),
                total_price=parse_price(m.group(5)),
                raw_position_text=m.group(0),
            ))

        if idx > 0:
            warnings.append(ParserWarning(
                code="FALLBACK_PARSING",
                message=(
                    f"Fallback parsing used: {idx} positions "
                    f"without order assignment"
                ),
                severity="warning",
            ))

    # ----------------------------------------------------------
    # Validation
    # ----------------------------------------------------------

    def _validate_results(
        self,
        header: ParsedHeader,
        lines: list[ParsedLine],
        warnings: list[ParserWarning],
    ) -> bool:
        """Check for blocking errors that indicate parse failure."""
        has_blocking = False

        if not header.fields.get("document_number"):
            has_blocking = True

        if not lines:
            has_blocking = True

        for line in lines:
            if not line.ean and not line.manufacturer_article_no:
                warnings.append(ParserWarning(
                    code="POSITION_NO_IDENTIFIER",
                    message=(
                        f"Position {line.position_index}: "
                        f"No EAN or article number"
                    ),
                    severity="error",
                    position_index=line.position_index,
                ))

        return not has_blocking
