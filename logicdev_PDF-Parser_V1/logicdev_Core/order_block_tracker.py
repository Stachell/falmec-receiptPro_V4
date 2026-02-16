"""
Order block tracking for invoice parsing.

Port of OrderBlockTracker.ts.
CRITICAL: Order numbers persist across positions until a new "Vs. ORDINE" appears.
"""
import re
from dataclasses import dataclass, field
from typing import Literal


OrderStatus = Literal["YES", "NO", "check"]

ORDER_REFERENCE_PATTERN = re.compile(r'Vs\.\s*ORDINE', re.IGNORECASE)


@dataclass
class OrderBlockResult:
    """Result of order lookup for a position."""
    primary: str | None = None
    raw: list[str] = field(default_factory=list)


def extract_order_candidates(text: str) -> list[str]:
    """
    Extract order candidates from order reference lines.

    Handles:
    - "Vs. ORDINE Nr. 10153"
    - "Vs. ORDINE 0_10170_173_172" (underscore-separated with short codes)
    - Multiple direct 10xxx numbers
    """
    candidates: list[str] = []

    # Look for underscore-separated format: 0_10170_173_172
    underscore_match = re.search(r'(\d+(?:_\d+)+)', text)
    if underscore_match:
        parts = underscore_match.group(1).split("_")
        base_prefix = ""
        for part in parts:
            if len(part) == 5 and part.startswith("10"):
                candidates.append(part)
                base_prefix = part[:2]
            elif len(part) == 3 and base_prefix:
                # Short code like 173 becomes 10173
                candidates.append(base_prefix + part)

    # Also extract standalone 10xxx numbers
    for match in re.finditer(r'\b(10\d{3})\b', text):
        if match.group(1) not in candidates:
            candidates.append(match.group(1))

    return candidates


def get_order_status(candidates: list[str]) -> OrderStatus:
    """Get order status based on candidates count."""
    if len(candidates) == 0:
        return "NO"
    if len(candidates) == 1:
        return "YES"
    return "check"


class OrderBlockTracker:
    """
    Tracks order numbers across position blocks.

    CRITICAL: Order numbers are NOT reset after each position!
    They persist until a new "Vs. ORDINE" line appears.
    """

    def __init__(self):
        self._current_block_orders: list[str] = []
        self._order_history: list[dict] = []
        self._position_count: int = 0

    def start_new_block(self, order_numbers: list[str]) -> None:
        """Start a new order block when 'Vs. ORDINE' is found."""
        if order_numbers:
            self._current_block_orders = list(order_numbers)
            self._order_history.append({
                "orders": list(order_numbers),
                "start_position": self._position_count + 1,
            })

    def get_orders_for_position(self) -> OrderBlockResult:
        """
        Get orders for the current position.
        IMPORTANT: Does NOT reset the order block!
        """
        self._position_count += 1
        return OrderBlockResult(
            primary=self._current_block_orders[-1] if self._current_block_orders else None,
            raw=list(self._current_block_orders),
        )

    @property
    def position_count(self) -> int:
        return self._position_count

    @property
    def order_history(self) -> list[dict]:
        return list(self._order_history)

    @property
    def has_active_orders(self) -> bool:
        return len(self._current_block_orders) > 0

    def reset(self) -> None:
        """Reset tracker for new parsing session."""
        self._current_block_orders = []
        self._order_history = []
        self._position_count = 0
