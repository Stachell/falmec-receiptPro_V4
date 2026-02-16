"""
devlogic PDF-PARSER_V1 - Core Engine

Standalone, modular PDF parser with pluggable parsing units.
"""
from .engine import PDFEngine
from .models import (
    ParseResult,
    ParsedHeader,
    ParsedLine,
    ParserWarning,
    RawTextItem,
    GroupedLine,
    ParsingUnitMeta,
)
from .price_parser import parse_price, parse_integer, format_price_eu
from .order_block_tracker import (
    OrderBlockTracker,
    extract_order_candidates,
    get_order_status,
)
from .line_grouper import build_grouped_lines, normalize_text
from .logger import setup_logging

__all__ = [
    "PDFEngine",
    "ParseResult",
    "ParsedHeader",
    "ParsedLine",
    "ParserWarning",
    "RawTextItem",
    "GroupedLine",
    "ParsingUnitMeta",
    "parse_price",
    "parse_integer",
    "format_price_eu",
    "OrderBlockTracker",
    "extract_order_candidates",
    "get_order_status",
    "build_grouped_lines",
    "normalize_text",
    "setup_logging",
]
