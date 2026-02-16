"""
European price format parsing utilities.

Port of PriceParser.ts: handles formats like "1.234,56" -> 1234.56
"""
import math


def parse_price(value: str) -> float:
    """Parse European price format (1.234,56 -> 1234.56)."""
    if not value:
        return 0.0
    normalized = value.strip()
    normalized = normalized.replace(".", "")    # Remove thousands separator
    normalized = normalized.replace(",", ".")   # Decimal separator
    try:
        return float(normalized)
    except ValueError:
        return 0.0


def parse_integer(value: str) -> int:
    """Parse integer from string."""
    if not value:
        return 0
    try:
        return int(value.strip())
    except ValueError:
        return 0


def format_price_eu(value: float, decimals: int = 2) -> str:
    """Format number as European price string (1234.56 -> '1.234,56')."""
    fixed = f"{value:.{decimals}f}"
    parts = fixed.split(".")
    int_part = parts[0]
    dec_part = parts[1] if len(parts) > 1 else "00"

    # Add thousands separators
    if len(int_part) > 3:
        groups = []
        while int_part:
            groups.append(int_part[-3:])
            int_part = int_part[:-3]
        int_part = ".".join(reversed(groups))

    return f"{int_part},{dec_part}"


def is_valid_price(value: float) -> bool:
    """Validate price value (non-negative finite number)."""
    return not math.isnan(value) and math.isfinite(value) and value >= 0
