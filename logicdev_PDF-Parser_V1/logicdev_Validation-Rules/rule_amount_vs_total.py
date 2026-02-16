"""
Validation Rule: Compare SUM(line total_price) vs invoice total.

WHEN: after parsing
COMPARE: SUM(total_price) across all lines
WITH: header.fields["invoice_total"]
ACTION: compare with tolerance (0.02 EUR) and report match/mismatch
"""
import sys
from pathlib import Path

_root_dir = Path(__file__).resolve().parent.parent
if str(_root_dir) not in sys.path:
    sys.path.insert(0, str(_root_dir))

from _base_rule import BaseValidationRule
from logicdev_Core.models import ParseResult


class AmountVsTotalRule(BaseValidationRule):
    rule_id = "amount_vs_total"
    rule_name = "Line Amounts vs Invoice Total"
    severity = "error"

    def validate(self, result: ParseResult) -> dict:
        sum_totals = sum(line.total_price for line in result.lines)
        sum_totals = round(sum_totals, 2)
        invoice_total = result.header.fields.get("invoice_total")

        if invoice_total is None:
            return {
                "rule_id": self.rule_id,
                "rule_name": self.rule_name,
                "passed": True,
                "message": "Invoice total not available, skipping comparison",
                "severity": "info",
                "details": {
                    "sum_line_totals": sum_totals,
                    "invoice_total": None,
                },
            }

        difference = round(sum_totals - invoice_total, 2)
        passed = abs(difference) < 0.02

        return {
            "rule_id": self.rule_id,
            "rule_name": self.rule_name,
            "passed": passed,
            "message": (
                f"SUM(amount)={sum_totals} matches invoice_total={invoice_total}"
                if passed
                else f"MISMATCH: SUM(amount)={sum_totals} != invoice_total={invoice_total} (diff={difference})"
            ),
            "severity": "info" if passed else self.severity,
            "details": {
                "sum_line_totals": sum_totals,
                "invoice_total": invoice_total,
                "difference": difference,
            },
        }
