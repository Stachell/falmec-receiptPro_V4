"""
Abstract base class for all parsing units.

Every parsing unit in logicdev_Pars-Units/ must contain a class
that inherits from BaseParsingUnit and implements its abstract methods.
"""
from abc import ABC, abstractmethod
import sys
from pathlib import Path

# Add parent directory to path so we can import logicdev_Core
_root_dir = Path(__file__).resolve().parent.parent
if str(_root_dir) not in sys.path:
    sys.path.insert(0, str(_root_dir))

from logicdev_Core.models import (
    ParseResult,
    ParsedHeader,
    ParsedLine,
    ParserWarning,
    RawTextItem,
    GroupedLine,
)


class BaseParsingUnit(ABC):
    """
    Abstract base class for parsing units.

    Subclasses must set class-level metadata and implement parse().
    The core engine handles PDF loading and text extraction;
    this class receives pre-extracted data.
    """

    # -- METADATA (override in subclass) --
    unit_id: str = "base"
    unit_name: str = "Base Parsing Unit"
    version: str = "0.0.0"
    description: str = ""

    @abstractmethod
    def parse(
        self,
        pages: list[str],
        raw_items: list[RawTextItem],
        grouped_lines: list[GroupedLine],
        page_count: int,
        source_file_name: str = "",
    ) -> ParseResult:
        """
        Parse the extracted PDF content and return structured data.

        Args:
            pages: List of page text strings (one per page).
            raw_items: List of RawTextItem with x,y coordinates.
            grouped_lines: Pre-grouped logical lines (sorted top-to-bottom).
            page_count: Total number of pages.
            source_file_name: Original PDF file name.

        Returns:
            ParseResult with header, lines, warnings.
        """
        ...

    def can_handle(self, pages: list[str]) -> bool:
        """
        Optional: Check if this unit can handle the given document.
        Default returns True (unit always applicable if selected).
        Override for auto-detection.
        """
        return True
