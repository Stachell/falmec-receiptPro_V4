"""
Dynamic parsing unit discovery and loading.

Scans logicdev_Pars-Units/ for Python files containing BaseParsingUnit subclasses.
Files starting with '_' are skipped (base class, templates, etc.).
"""
import importlib.util
import sys
from pathlib import Path
import logging

logger = logging.getLogger("pdfparser.unit_loader")


def _load_base_class(units_dir: Path):
    """Load the BaseParsingUnit class from _base_unit.py."""
    base_path = units_dir / "_base_unit.py"
    if not base_path.exists():
        logger.error(f"Base unit file not found: {base_path}")
        return None

    spec = importlib.util.spec_from_file_location("_base_unit", base_path)
    mod = importlib.util.module_from_spec(spec)
    # Register in sys.modules so `from _base_unit import ...` works in units
    sys.modules["_base_unit"] = mod
    spec.loader.exec_module(mod)
    return mod.BaseParsingUnit


def discover_units(units_dir: str | Path) -> dict:
    """
    Discover and instantiate all parsing units in the given directory.

    Args:
        units_dir: Path to logicdev_Pars-Units/ directory.

    Returns:
        Dict mapping unit_id -> instantiated BaseParsingUnit subclass.
    """
    units_dir = Path(units_dir)
    if not units_dir.is_dir():
        logger.warning(f"Parsing units directory not found: {units_dir}")
        return {}

    BaseParsingUnit = _load_base_class(units_dir)
    if BaseParsingUnit is None:
        return {}

    # Ensure the module root is in sys.path for imports within units
    module_root = units_dir.parent
    if str(module_root) not in sys.path:
        sys.path.insert(0, str(module_root))
    if str(units_dir) not in sys.path:
        sys.path.insert(0, str(units_dir))

    units = {}

    for py_file in sorted(units_dir.glob("*.py")):
        # Skip private/template files (starting with _)
        if py_file.name.startswith("_"):
            continue

        try:
            module_name = f"pars_unit_{py_file.stem}"
            spec = importlib.util.spec_from_file_location(module_name, py_file)
            mod = importlib.util.module_from_spec(spec)
            sys.modules[module_name] = mod
            spec.loader.exec_module(mod)

            # Find all BaseParsingUnit subclasses in the module
            for attr_name in dir(mod):
                attr = getattr(mod, attr_name)
                if (isinstance(attr, type)
                        and issubclass(attr, BaseParsingUnit)
                        and attr is not BaseParsingUnit):
                    instance = attr()
                    units[instance.unit_id] = instance
                    logger.info(
                        f"Loaded parsing unit: {instance.unit_id} "
                        f"({instance.unit_name} v{instance.version})"
                    )
        except Exception as e:
            logger.error(f"Failed to load parsing unit {py_file.name}: {e}")

    return units


def list_available_units(units_dir: str | Path) -> list[dict]:
    """
    List available parsing units with metadata.

    Returns:
        List of dicts with unit_id, unit_name, version, description.
    """
    units = discover_units(units_dir)
    return [
        {
            "unit_id": u.unit_id,
            "unit_name": u.unit_name,
            "version": u.version,
            "description": u.description,
        }
        for u in units.values()
    ]
