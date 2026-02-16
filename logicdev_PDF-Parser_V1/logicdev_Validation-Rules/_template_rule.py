"""
TEMPLATE: Copy this file to create a new validation rule.

Instructions:
1. Copy this file to logicdev_Validation-Rules/ with name "rule_<name>.py"
   (e.g., "rule_total_price_check.py")
2. Rename the class (e.g., TotalPriceCheckRule)
3. Set rule_id, rule_name, severity
4. Implement the validate() method
5. The rule will be auto-discovered by the validation runner
"""
import sys
from pathlib import Path

_root_dir = Path(__file__).resolve().parent.parent
if str(_root_dir) not in sys.path:
    sys.path.insert(0, str(_root_dir))

from _base_rule import BaseValidationRule
from logicdev_Core.models import ParseResult


class TemplateRule(BaseValidationRule):
    rule_id = "template_rule"
    rule_name = "Template Validation Rule"
    severity = "warning"

    def validate(self, result: ParseResult) -> dict:
        # TODO: Implement your validation logic here
        #
        # Access parsed data:
        #   result.header.fields  -> dict of header values
        #   result.lines          -> list of ParsedLine
        #   result.warnings       -> existing warnings
        #
        # Example:
        #   total = sum(line.total_price for line in result.lines)
        #   expected = result.header.fields.get("total_amount", 0)
        #   passed = abs(total - expected) < 0.01

        return {
            "rule_id": self.rule_id,
            "rule_name": self.rule_name,
            "passed": True,
            "message": "Template rule - always passes",
            "severity": "info",
            "details": {},
        }
