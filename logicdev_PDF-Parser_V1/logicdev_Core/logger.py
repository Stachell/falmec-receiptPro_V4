"""Centralized logging configuration for devlogic PDF-PARSER_V1."""
import logging
import sys


def setup_logging(level: str = "INFO", log_file: str | None = None):
    """
    Configure logging for the PDF parser module.

    Args:
        level: Log level string (DEBUG, INFO, WARNING, ERROR).
        log_file: Optional file path to write logs to.
    """
    log_level = getattr(logging, level.upper(), logging.INFO)

    handlers: list[logging.Handler] = [logging.StreamHandler(sys.stdout)]
    if log_file:
        handlers.append(logging.FileHandler(log_file, encoding="utf-8"))

    logging.basicConfig(
        level=log_level,
        format="[%(asctime)s] %(name)s %(levelname)s: %(message)s",
        datefmt="%H:%M:%S",
        handlers=handlers,
        force=True,
    )
