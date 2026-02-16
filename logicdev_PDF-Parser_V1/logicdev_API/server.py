"""
devlogic PDF-PARSER_V1 - FastAPI REST Server

Bridges the Python parser with the React frontend (falmec-reicptpro_v3).

Endpoints:
  GET  /health              - Server health check
  GET  /units               - List available parsing units
  POST /parse               - Parse a PDF file
  POST /debug/extract-text  - Extract raw text from PDF (debugging)

Start with:
  .venv/Scripts/python.exe -m uvicorn logicdev_API.server:app --port 8090 --reload
"""
import sys
import tempfile
import logging
from pathlib import Path
from dataclasses import asdict

import pdfplumber
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware

# Add module root to sys.path
_MODULE_ROOT = Path(__file__).resolve().parent.parent
if str(_MODULE_ROOT) not in sys.path:
    sys.path.insert(0, str(_MODULE_ROOT))

from logicdev_Core import PDFEngine, setup_logging

setup_logging("INFO")
logger = logging.getLogger("pdfparser.api")

app = FastAPI(
    title="devlogic PDF-PARSER_V1",
    description="Modular PDF parsing service for falmec-reicptpro",
    version="1.0.0",
)

# Allow React dev server (Vite default ports)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8080",
        "http://localhost:8081",
        "http://localhost:5173",
        "http://127.0.0.1:8080",
        "http://127.0.0.1:5173",
    ],
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

_engine = PDFEngine()


@app.get("/health")
def health():
    """Server health check."""
    return {"status": "ok", "version": "1.0.0", "parser": "devlogic_PDF-PARSER_V1"}


@app.get("/units")
def list_units():
    """List all available parsing units."""
    return {"units": _engine.list_units()}


@app.post("/parse")
async def parse_pdf(
    file: UploadFile = File(..., description="PDF file to parse"),
    unit_id: str = Form(default="fattura_falmec_v1", description="Parsing unit ID"),
    y_tolerance: float = Form(default=10.0, description="Y-position tolerance for line grouping"),
    run_validation: bool = Form(default=True, description="Run validation rules after parsing"),
):
    """
    Parse a PDF invoice file.

    Returns a complete ParseResult as JSON with:
    - header.fields: document_number, document_date, packages_count, invoice_total, ...
    - lines: parsed invoice positions
    - warnings: parser warnings and errors
    - validation_results: results from post-parse validation rules
    """
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted.")

    logger.info(f"API parse request: file={file.filename}, unit={unit_id}")

    # Write uploaded file to a temp location (PDFEngine needs a file path)
    pdf_bytes = await file.read()
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp.write(pdf_bytes)
        tmp_path = Path(tmp.name)

    try:
        result = _engine.parse(
            pdf_path=tmp_path,
            unit_id=unit_id,
            y_tolerance=y_tolerance,
            run_validation_rules=run_validation,
        )
        result.source_file_name = file.filename
        return asdict(result)
    except Exception as e:
        logger.exception(f"Parse error for {file.filename}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        tmp_path.unlink(missing_ok=True)


@app.post("/debug/extract-text")
async def debug_extract_text(
    file: UploadFile = File(..., description="PDF file to extract text from"),
    y_tolerance: float = Form(default=10.0, description="Y-position tolerance for text grouping"),
):
    """
    Debug endpoint: Extract raw text from PDF using pdfplumber.

    Returns the text extracted from each page, useful for debugging pattern matching issues.
    """
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted.")

    logger.info(f"API debug extract-text request: file={file.filename}")

    # Write uploaded file to a temp location
    pdf_bytes = await file.read()
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp.write(pdf_bytes)
        tmp_path = Path(tmp.name)

    try:
        pages_text = []
        with pdfplumber.open(tmp_path) as pdf:
            for page_num, page in enumerate(pdf.pages, start=1):
                # Extract text with same settings as parser
                text = page.extract_text(
                    x_tolerance=3,
                    y_tolerance=y_tolerance,
                    layout=False,
                    x_density=7.25,
                    y_density=13,
                )
                pages_text.append({
                    "page_number": page_num,
                    "text": text or "",
                    "char_count": len(text) if text else 0,
                })

        return {
            "filename": file.filename,
            "total_pages": len(pages_text),
            "pages": pages_text,
        }
    except Exception as e:
        logger.exception(f"Text extraction error for {file.filename}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        tmp_path.unlink(missing_ok=True)
