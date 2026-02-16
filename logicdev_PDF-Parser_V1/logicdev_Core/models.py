"""
Data models for devlogic PDF-PARSER_V1

All shared types used across core engine, parsing units, and validation rules.
Python dataclass equivalents of the TypeScript interfaces from the original project.
"""
from dataclasses import dataclass, field
from typing import Optional, Literal
from datetime import datetime


# -- Type Aliases --
OrderStatus = Literal["YES", "NO", "check"]
WarningSeverity = Literal["info", "warning", "error"]
QtyValidationStatus = Literal["ok", "mismatch", "unknown"]


@dataclass
class RawTextItem:
    """Single text element extracted from PDF with coordinates."""
    page: int
    text: str
    x: float
    y: float
    width: float = 0.0
    height: float = 0.0


@dataclass
class GroupedLine:
    """A logical line reconstructed from multiple RawTextItems at similar Y."""
    key: float
    text: str
    items: list[RawTextItem] = field(default_factory=list)
    page: int = 1


@dataclass
class ParserWarning:
    """Warning or error from parsing."""
    code: str
    message: str
    severity: WarningSeverity
    position_index: Optional[int] = None
    context: Optional[dict] = None


@dataclass
class ParsedLine:
    """Single parsed document line item (position)."""
    position_index: int
    manufacturer_article_no: str = ""
    ean: str = ""
    description: str = ""
    quantity_delivered: int = 0
    unit_price: float = 0.0
    total_price: float = 0.0
    order_candidates: list[str] = field(default_factory=list)
    order_candidates_text: str = ""
    order_status: OrderStatus = "NO"
    raw_position_text: str = ""


@dataclass
class ParsedHeader:
    """
    Parsed document header fields.

    Uses a generic dict so any parsing unit can store arbitrary header fields.
    This makes the module dashboard-compatible (fields rendered dynamically).
    """
    fields: dict = field(default_factory=dict)


@dataclass
class ParseResult:
    """Complete result from a parsing run."""
    success: bool
    header: ParsedHeader
    lines: list[ParsedLine]
    warnings: list[ParserWarning]
    validation_results: list[dict] = field(default_factory=list)
    parser_unit: str = ""
    parsed_at: str = ""
    source_file_name: str = ""

    def __post_init__(self):
        if not self.parsed_at:
            self.parsed_at = datetime.now().isoformat()


@dataclass
class ParsingUnitMeta:
    """Metadata about a parsing unit (for discovery/listing)."""
    unit_id: str
    unit_name: str
    version: str
    description: str = ""
