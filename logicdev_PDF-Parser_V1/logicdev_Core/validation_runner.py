"""
Post-parsing validation rules executor.

Discovers and runs validation rules from logicdev_Validation-Rules/.
Each rule inspects a ParseResult and returns a validation result dict.
"""
import importlib.util
import sys
from pathlib import Path
from .models import ParseResult, ParserWarning
import logging

logger = logging.getLogger("pdfparser.validation")


def _load_base_rule_class(rules_dir: Path):
    """Load the BaseValidationRule class from _base_rule.py."""
    base_path = rules_dir / "_base_rule.py"
    if not base_path.exists():
        logger.error(f"Base rule file not found: {base_path}")
        return None

    spec = importlib.util.spec_from_file_location("_base_rule", base_path)
    mod = importlib.util.module_from_spec(spec)
    # Register in sys.modules so `from _base_rule import ...` works in rules
    sys.modules["_base_rule"] = mod
    spec.loader.exec_module(mod)
    return mod.BaseValidationRule


def discover_rules(rules_dir: str | Path) -> list:
    """Discover all validation rule classes in the rules directory."""
    rules_dir = Path(rules_dir)
    if not rules_dir.is_dir():
        return []

    BaseValidationRule = _load_base_rule_class(rules_dir)
    if BaseValidationRule is None:
        return []

    # Ensure paths are in sys.path
    module_root = rules_dir.parent
    if str(module_root) not in sys.path:
        sys.path.insert(0, str(module_root))
    if str(rules_dir) not in sys.path:
        sys.path.insert(0, str(rules_dir))

    rules = []
    for py_file in sorted(rules_dir.glob("rule_*.py")):
        try:
            mod_name = f"val_rule_{py_file.stem}"
            spec = importlib.util.spec_from_file_location(mod_name, py_file)
            mod = importlib.util.module_from_spec(spec)
            sys.modules[mod_name] = mod
            spec.loader.exec_module(mod)

            for attr_name in dir(mod):
                attr = getattr(mod, attr_name)
                if (isinstance(attr, type)
                        and issubclass(attr, BaseValidationRule)
                        and attr is not BaseValidationRule):
                    rules.append(attr())
                    logger.info(f"Loaded validation rule: {attr().rule_id}")
        except Exception as e:
            logger.error(f"Failed to load rule {py_file.name}: {e}")

    return rules


def run_validation(
    result: ParseResult,
    rules_dir: str | Path,
) -> list[dict]:
    """
    Run all validation rules against a parse result.

    Returns:
        List of validation result dicts:
        [{"rule_id", "rule_name", "passed", "message", "severity", "details"}, ...]
    """
    rules = discover_rules(rules_dir)
    validation_results = []

    for rule in rules:
        try:
            vr = rule.validate(result)
            validation_results.append(vr)

            if not vr.get("passed", True):
                result.warnings.append(ParserWarning(
                    code=f"VALIDATION_{vr['rule_id'].upper()}",
                    message=vr.get("message", "Validation failed"),
                    severity=vr.get("severity", "warning"),
                ))
        except Exception as e:
            logger.error(f"Validation rule {rule.rule_id} failed: {e}")
            validation_results.append({
                "rule_id": rule.rule_id,
                "passed": False,
                "message": f"Rule execution error: {e}",
                "severity": "error",
            })

    return validation_results
