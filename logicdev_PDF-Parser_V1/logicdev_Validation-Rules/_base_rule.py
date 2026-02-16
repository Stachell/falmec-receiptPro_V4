"""
Abstract base class for validation rules.

Every validation rule in logicdev_Validation-Rules/ must contain a class
that inherits from BaseValidationRule and implements validate().
"""
from abc import ABC, abstractmethod
import sys
from pathlib import Path

# Add parent directory to path so we can import logicdev_Core
_root_dir = Path(__file__).resolve().parent.parent
if str(_root_dir) not in sys.path:
    sys.path.insert(0, str(_root_dir))

from logicdev_Core.models import ParseResult


class BaseValidationRule(ABC):
    """
    Base class for post-parsing validation rules.

    Each rule inspects a ParseResult and returns a validation dict:
    {
        "rule_id": str,
        "rule_name": str,
        "passed": bool,
        "message": str,
        "severity": "info" | "warning" | "error",
        "details": dict  (optional extra data)
    }
    """

    rule_id: str = "base"
    rule_name: str = "Base Rule"
    severity: str = "warning"

    @abstractmethod
    def validate(self, result: ParseResult) -> dict:
        """
        Validate a parse result.

        Args:
            result: The ParseResult to validate.

        Returns:
            Dict with rule_id, rule_name, passed, message, severity, details.
        """
        ...
