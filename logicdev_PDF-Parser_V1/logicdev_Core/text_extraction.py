"""
PDF text extraction using pdfplumber.

Extracts text with position information (x, y, width, height)
for layout-aware parsing, analogous to pdfjs-dist in the TS version.
"""
import pdfplumber
from pathlib import Path
from .models import RawTextItem


def extract_text_from_pdf(
    pdf_path: str | Path,
) -> tuple[list[str], list[RawTextItem], int]:
    """
    Extract text content from PDF with position information.

    Args:
        pdf_path: Path to the PDF file.

    Returns:
        Tuple of (page_texts, raw_items, page_count)
        - page_texts: List of reconstructed page text strings
        - raw_items: List of RawTextItem with coordinates
        - page_count: Total number of pages
    """
    pdf_path = Path(pdf_path)
    pages: list[str] = []
    raw_items: list[RawTextItem] = []

    with pdfplumber.open(pdf_path) as pdf:
        for page_num, page in enumerate(pdf.pages, start=1):
            # Extract individual words with bounding boxes
            words = page.extract_words(
                keep_blank_chars=False,
                x_tolerance=3,
                y_tolerance=3,
            )

            for word in words:
                text = word.get("text", "").strip()
                if text:
                    raw_items.append(RawTextItem(
                        page=page_num,
                        text=text,
                        x=round(word["x0"], 1),
                        y=round(word["top"], 1),
                        width=round(word["x1"] - word["x0"], 1),
                        height=round(word["bottom"] - word["top"], 1),
                    ))

            # Reconstruct full page text (sorted top-to-bottom, left-to-right)
            page_text = page.extract_text(
                x_tolerance=3,
                y_tolerance=3,
            ) or ""
            pages.append(page_text)

        return pages, raw_items, len(pdf.pages)
