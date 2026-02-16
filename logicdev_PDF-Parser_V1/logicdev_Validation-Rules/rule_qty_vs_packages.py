"""
Validation Rule: Compare SUM(quantity) vs packages count.

WHEN: after parsing
COMPARE: SUM(quantity_delivered) across all lines
WITH: header.fields["packages_count"]
ACTION: compare and report match/mismatch
"""
import sys
from pathlib import Path

_root_dir = Path(__file__).resolve().parent.parent
if str(_root_dir) not in sys.path:
    sys.path.insert(0, str(_root_dir))

from _base_rule import BaseValidationRule
from logicdev_Core.models import ParseResult


class QtyVsPackagesRule(BaseValidationRule):
    rule_id = "qty_vs_packages"
    rule_name = "Quantity Sum vs Packages Count"
    severity = "warning"

    def validate(self, result: ParseResult) -> dict:
        sum_qty = sum(line.quantity_delivered for line in result.lines)
        packages = result.header.fields.get("packages_count")

        if packages is None:
            return {
                "rule_id": self.rule_id,
                "rule_name": self.rule_name,
                "passed": True,
                "message": "Packages count not available, skipping comparison",
                "severity": "info",
                "details": {"sum_qty": sum_qty, "packages_count": None},
            }

        passed = sum_qty == packages
        return {
            "rule_id": self.rule_id,
            "rule_name": self.rule_name,
            "passed": passed,
            "message": (
                f"SUM(qty)={sum_qty} matches packages_count={packages}"
                if passed
                else f"MISMATCH: SUM(qty)={sum_qty} != packages_count={packages}"
            ),
            "severity": "info" if passed else self.severity,
            "details": {
                "sum_qty": sum_qty,
                "packages_count": packages,
                "difference": sum_qty - packages if packages else None,
            },
        }
