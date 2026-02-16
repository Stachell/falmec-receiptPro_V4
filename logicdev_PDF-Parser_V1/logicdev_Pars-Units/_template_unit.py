"""
TEMPLATE: Copy this file to create a new parsing unit.

Instructions:
1. Copy this file to logicdev_Pars-Units/ with a descriptive name
   (e.g., "invoice_acme_v1.py")
2. Rename the class (e.g., InvoiceAcmeV1)
3. Set the metadata (unit_id, unit_name, version, description)
4. Implement the parse() method
5. The unit will be auto-discovered by the engine
"""
import sys
from pathlib import Path

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


class TemplateParsingUnit(BaseParsingUnit):
    unit_id = "template_v1"
    unit_name = "Template Parsing Unit"
    version = "1.0.0"
    description = "Template - copy and customize for your document format"

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

        # TODO: Implement your parsing logic here
        #
        # Use 'pages' for full-text regex matching (header, footer)
        # Use 'grouped_lines' for position-by-position parsing
        # Use 'raw_items' for coordinate-based analysis
        #
        # Example:
        #   for gline in grouped_lines:
        #       text = gline.text
        #       items = gline.items  # RawTextItem list with x,y coords
        #       ...

        return ParseResult(
            success=len(lines) > 0,
            header=header,
            lines=lines,
            warnings=warnings,
            parser_unit=self.unit_id,
            source_file_name=source_file_name,
        )
