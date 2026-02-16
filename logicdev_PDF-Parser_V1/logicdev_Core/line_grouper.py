"""
Group raw text items by Y-position into logical lines.

Port of groupItemsByLine() and sortLineKeys() from the TS TextExtractor.
Note: pdfplumber uses top-down coordinates (top=0 at page top, increasing
downward), unlike pdfjs-dist which uses bottom-up. Sort is ascending here.
"""
import re
from .models import RawTextItem, GroupedLine


def group_items_by_line(
    raw_items: list[RawTextItem],
    y_tolerance: float = 3.0,
) -> dict[float, list[RawTextItem]]:
    """
    Group raw items by approximate Y position (same line).

    Args:
        raw_items: Raw text items from PDF extraction.
        y_tolerance: Y position tolerance for grouping (default 3px).

    Returns:
        Dict keyed by (page * 10000 + rounded_y) -> list of items on that line.
    """
    line_groups: dict[float, list[RawTextItem]] = {}

    for item in raw_items:
        rounded_y = round(item.y / y_tolerance) * y_tolerance
        key = item.page * 10000 + rounded_y

        if key not in line_groups:
            line_groups[key] = []
        line_groups[key].append(item)

    return line_groups


def sort_line_keys(keys: list[float]) -> list[float]:
    """
    Sort line group keys by page then Y position (top to bottom).

    pdfplumber: top=0 at page top, increasing downward.
    So ascending sort gives top-to-bottom reading order.
    """
    def sort_key(k: float) -> tuple[int, float]:
        page = int(k // 10000)
        y_pos = k % 10000
        return (page, y_pos)

    return sorted(keys, key=sort_key)


def build_grouped_lines(
    raw_items: list[RawTextItem],
    y_tolerance: float = 3.0,
) -> list[GroupedLine]:
    """
    Build ordered list of GroupedLine objects from raw items.

    Convenience function combining group + sort + normalize.
    """
    groups = group_items_by_line(raw_items, y_tolerance)
    sorted_keys = sort_line_keys(list(groups.keys()))

    result: list[GroupedLine] = []
    for key in sorted_keys:
        items = groups[key]
        # Sort items left-to-right by x position
        items.sort(key=lambda i: i.x)
        text = " ".join(i.text for i in items)
        text = normalize_text(text)
        page = items[0].page if items else 1
        result.append(GroupedLine(key=key, text=text, items=items, page=page))

    return result


def normalize_text(text: str) -> str:
    """Normalize: trim, collapse whitespace, remove NBSP."""
    text = text.strip()
    text = re.sub(r'\s+', ' ', text)
    text = text.replace('\u00a0', ' ')
    return text
