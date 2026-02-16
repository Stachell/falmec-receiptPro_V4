"""
Validation Rule: Every position must have EAN or article number.

Ensures data quality by checking that each parsed line has at least
one identifier (EAN code or manufacturer article number).
"""
import sys
from pathlib import Path

_root_dir = Path(__file__).resolve().parent.parent
if str(_root_dir) not in sys.path:
    sys.path.insert(0, str(_root_dir))

from _base_rule import BaseValidationRule
from logicdev_Core.models import ParseResult


class PositionIdentifierRule(BaseValidationRule):
    rule_id = "position_identifier"
    rule_name = "Position Must Have Identifier"
    severity = "error"

    def validate(self, result: ParseResult) -> dict:
        missing = []
        for line in result.lines:
            if not line.ean and not line.manufacturer_article_no:
                missing.append(line.position_index)

        passed = len(missing) == 0
        return {
            "rule_id": self.rule_id,
            "rule_name": self.rule_name,
            "passed": passed,
            "message": (
                "All positions have an identifier (EAN or article number)"
                if passed
                else f"Positions without identifier: {missing}"
            ),
            "severity": "info" if passed else self.severity,
            "details": {"missing_positions": missing},
        }
