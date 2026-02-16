"""
CLI entry point for devlogic PDF-PARSER_V1.

Usage:
    python run_parse.py --config path/to/TESTPARSING.txt
    python run_parse.py --pdf invoice.pdf --unit fattura_falmec_v1
    python run_parse.py --list-units
"""
import argparse
import json
import sys
import csv
from pathlib import Path
from dataclasses import asdict
from configparser import ConfigParser

# Add module root to path
sys.path.insert(0, str(Path(__file__).resolve().parent))

from logicdev_Core import PDFEngine, setup_logging
from logicdev_Core.price_parser import format_price_eu
from logicdev_Core.models import ParseResult


def parse_config_file(config_path: Path) -> dict:
    """Parse TESTPARSING.txt configuration (INI format)."""
    config = ConfigParser()
    config.read(config_path, encoding="utf-8")

    # Accept both "parsing_skript" (new) and "unit_id" (legacy)
    unit_id = config.get("test", "parsing_skript", fallback="")
    if not unit_id:
        unit_id = config.get("test", "unit_id", fallback="")

    return {
        "unit_id": unit_id,
        "pdf_file": config.get("test", "pdf_file", fallback=""),
        "output_format": config.get("test", "output_format", fallback="json"),
        "y_tolerance": config.getfloat("test", "y_tolerance", fallback=3.0),
        "run_validation": config.getboolean("test", "run_validation", fallback=True),
        "log_level": config.get("test", "log_level", fallback="INFO"),
    }


def _translate_validation_msg(rule_id: str, vr: dict, hf: dict) -> str:
    """Translate known validation messages to German for the report."""
    if rule_id == "qty_vs_packages":
        details = vr.get("details", {})
        qty_sum = details.get("sum_qty", "?")
        pkg = details.get("packages_count", "?")
        if vr.get("passed"):
            return f"Summe Menge ({qty_sum}) = Paketanzahl ({pkg})"
        return f"Summe Menge ({qty_sum}) \u2260 Paketanzahl ({pkg})"
    if rule_id == "position_identifier":
        if vr.get("passed"):
            return "Alle Positionen haben EAN oder Artikelnr."
        missing = vr.get("details", {}).get("missing_positions", [])
        return f"{len(missing)} Position(en) ohne EAN und Artikelnr."
    if rule_id == "amount_vs_total":
        details = vr.get("details", {})
        line_sum = details.get("sum_line_totals", "?")
        inv_total = details.get("invoice_total", "?")
        if vr.get("passed"):
            ls = format_price_eu(line_sum) if isinstance(line_sum, float) else line_sum
            it = format_price_eu(inv_total) if isinstance(inv_total, float) else inv_total
            return f"Positionssumme ({ls}) = Rechnungsgesamt ({it})"
        ls = format_price_eu(line_sum) if isinstance(line_sum, float) else line_sum
        it = format_price_eu(inv_total) if isinstance(inv_total, float) else inv_total
        diff = details.get("difference", "?")
        return f"Positionssumme ({ls}) \u2260 Rechnungsgesamt ({it}), Differenz: {diff}"
    return vr.get("message", "-")


def _translate_warning(msg: str) -> str:
    """Translate known warning messages to German."""
    msg = msg.replace("Incomplete position at end:", "Unvollständige Position am Ende:")
    msg = msg.replace("Art=", "Artikel=")
    return msg


def write_markdown_report(
    result: ParseResult, pdf_path: Path, output_dir: Path,
) -> Path:
    """
    Write a human-readable Markdown report (German) alongside the JSON output.

    Returns the path to the written .md file.
    """
    md_path = output_dir / f"{pdf_path.stem}_report.md"

    hf = result.header.fields
    status_de = "ERFOLGREICH" if result.success else "FEHLGESCHLAGEN"

    # German translations for known validation rule names
    rule_name_de = {
        "qty_vs_packages": "Menge vs. Pakete",
        "position_identifier": "Positions-Kennung",
        "amount_vs_total": "Positionssumme vs. Rechnungsgesamt",
    }

    # --- Zusammenfassung ---
    total_qty = sum(l.quantity_delivered for l in result.lines)

    lines = []
    lines.append(f"# Parsing-Ergebnis: {pdf_path.name}")
    lines.append("")
    lines.append("## Zusammenfassung")
    lines.append("")
    lines.append("| Feld | Wert |")
    lines.append("|------|------|")
    lines.append(f"| Ergebnis | {status_de} |")
    lines.append(f"| Parsing-Skript | {result.parser_unit} |")
    lines.append(
        f"| Rechnungsnr. | {hf.get('document_number', '-')} |"
    )
    lines.append(f"| Datum | {hf.get('document_date', '-')} |")
    lines.append(f"| Positionen | {len(result.lines)} |")
    lines.append(f"| Summe Menge | {total_qty} |")

    packages = hf.get("packages_count")
    if packages is not None:
        lines.append(f"| Pakete | {packages} |")

    invoice_total = hf.get("invoice_total")
    if invoice_total is not None:
        lines.append(
            f"| Rechnungsgesamt | {format_price_eu(invoice_total)} EUR |"
        )

    lines.append("")

    # --- Positionen ---
    lines.append("## Positionen")
    lines.append("")
    lines.append(
        "| Nr. | Artikelnr. | EAN | Menge "
        "| Einzelpreis | Gesamtpreis | Bestellung |"
    )
    lines.append(
        "|-----|-----------|-----|------:"
        "|------------:|------------:|------------|"
    )

    for pl in result.lines:
        art = pl.manufacturer_article_no or "-"
        ean = pl.ean or "-"
        qty = pl.quantity_delivered
        up = format_price_eu(pl.unit_price) if pl.unit_price else "-"
        tp = format_price_eu(pl.total_price) if pl.total_price else "-"
        order = pl.order_candidates_text or "-"
        lines.append(
            f"| {pl.position_index} | {art} | {ean} | {qty} "
            f"| {up} | {tp} | {order} |"
        )

    lines.append("")

    # --- Prüfregeln ---
    if result.validation_results:
        sev_map = {
            "info": "Info", "warning": "Warnung", "error": "Fehler",
        }
        lines.append("## Prüfregeln")
        lines.append("")
        lines.append("| Regel | Ergebnis | Beschreibung |")
        lines.append("|-------|----------|-------------|")

        for vr in result.validation_results:
            rid = vr.get("rule_id", "")
            rule_label = rule_name_de.get(rid, vr.get("rule_name", rid))
            passed = vr.get("passed", False)
            result_de = "BESTANDEN" if passed else "NICHT BESTANDEN"
            msg = _translate_validation_msg(rid, vr, hf)
            lines.append(f"| {rule_label} | {result_de} | {msg} |")

        lines.append("")

    # --- Hinweise (Warnings) ---
    if result.warnings:
        sev_map = {
            "info": "Info", "warning": "Warnung", "error": "Fehler",
        }
        lines.append("## Hinweise")
        lines.append("")
        for w in result.warnings:
            sev_de = sev_map.get(w.severity, w.severity)
            msg_de = _translate_warning(w.message)
            lines.append(f"- [{sev_de}] {msg_de}")
        lines.append("")

    with open(md_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    return md_path


def main():
    parser = argparse.ArgumentParser(
        description="devlogic PDF-PARSER_V1 - Modular PDF Parser",
    )
    parser.add_argument(
        "--config", type=Path,
        help="Path to TESTPARSING.txt config file",
    )
    parser.add_argument(
        "--pdf", type=Path,
        help="Direct path to PDF file",
    )
    parser.add_argument(
        "--unit", type=str,
        help="Parsing unit ID (e.g., fattura_falmec_v1)",
    )
    parser.add_argument(
        "--pdf-dir", type=Path,
        help="Directory containing PDF files",
    )
    parser.add_argument(
        "--output-dir", type=Path,
        help="Output directory for results",
    )
    parser.add_argument(
        "--output-format",
        choices=["json", "csv", "both"],
        default="json",
        help="Output format (default: json)",
    )
    parser.add_argument(
        "--list-units",
        action="store_true",
        help="List available parsing units and exit",
    )
    parser.add_argument(
        "--log-level",
        default="INFO",
        help="Log level: DEBUG, INFO, WARNING, ERROR",
    )

    args = parser.parse_args()

    # Determine settings from config file or CLI args
    if args.config:
        cfg = parse_config_file(args.config)
        unit_id = args.unit or cfg["unit_id"]
        pdf_dir = args.pdf_dir or args.config.parent / "test_pdfs"
        pdf_path = (
            pdf_dir / cfg["pdf_file"] if cfg["pdf_file"] else args.pdf
        )
        output_dir = args.output_dir or args.config.parent / "test_output"
        output_format = cfg["output_format"]
        log_level = cfg["log_level"]
        y_tolerance = cfg["y_tolerance"]
        run_validation = cfg["run_validation"]
    else:
        unit_id = args.unit
        pdf_path = args.pdf
        output_dir = args.output_dir or Path(".")
        output_format = args.output_format
        log_level = args.log_level
        y_tolerance = 3.0
        run_validation = True

    setup_logging(log_level)

    engine = PDFEngine()

    # List units mode
    if args.list_units:
        print("\n  Available parsing units:")
        print("  " + "-" * 58)
        for u in engine.list_units():
            print(
                f"    {u['unit_id']:30s} {u['unit_name']} v{u['version']}"
            )
        print()
        return

    # Parse mode - validate inputs
    if not pdf_path or not pdf_path.exists():
        print(f"[ERROR] PDF file not found: {pdf_path}")
        sys.exit(1)

    if not unit_id:
        print("[ERROR] No parsing unit specified. Use --unit or set in config.")
        print("        Use --list-units to see available units.")
        sys.exit(1)

    # Run parsing
    result = engine.parse(
        pdf_path=pdf_path,
        unit_id=unit_id,
        y_tolerance=y_tolerance,
        run_validation_rules=run_validation,
    )

    # Write output
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    result_dict = asdict(result)

    if output_format in ("json", "both"):
        out_file = output_dir / f"{pdf_path.stem}_result.json"
        with open(out_file, "w", encoding="utf-8") as f:
            json.dump(result_dict, f, indent=2, ensure_ascii=False)
        print(f"[OUTPUT] JSON: {out_file}")

    if output_format in ("csv", "both"):
        out_file = output_dir / f"{pdf_path.stem}_lines.csv"
        if result.lines:
            fieldnames = list(asdict(result.lines[0]).keys())
            with open(out_file, "w", encoding="utf-8", newline="") as f:
                writer = csv.DictWriter(
                    f, fieldnames=fieldnames, delimiter=";",
                )
                writer.writeheader()
                for line in result.lines:
                    row = asdict(line)
                    # Convert list to pipe-separated string for CSV
                    row["order_candidates"] = "|".join(row["order_candidates"])
                    writer.writerow(row)
            print(f"[OUTPUT] CSV:  {out_file}")

    # Always write markdown report
    md_file = write_markdown_report(result, pdf_path, output_dir)
    print(f"[OUTPUT] Report: {md_file}")

    # Print summary
    print()
    print("=" * 50)
    print(f"  Result: {'SUCCESS' if result.success else 'FAILED'}")
    print(f"  Parser: {result.parser_unit}")
    print(
        f"  Doc #:  "
        f"{result.header.fields.get('document_number', 'N/A')}"
    )
    print(
        f"  Date:   "
        f"{result.header.fields.get('document_date', 'N/A')}"
    )
    print(f"  Lines:  {len(result.lines)}")
    print(f"  Warns:  {len(result.warnings)}")

    if result.validation_results:
        passed = sum(
            1 for v in result.validation_results if v.get("passed")
        )
        total = len(result.validation_results)
        print(f"  Valid:  {passed}/{total} rules passed")

    print("=" * 50)
    print()

    sys.exit(0 if result.success else 1)


if __name__ == "__main__":
    main()
