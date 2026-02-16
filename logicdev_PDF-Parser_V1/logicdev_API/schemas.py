"""
API schemas for future dashboard integration.

These schemas define the request/response format for the REST API
that will power the PDF parsing dashboard.

NOTE: This file is a preparation for future implementation.
      Uncomment and complete when building the dashboard.
"""

# When implementing the dashboard, uncomment the following:
#
# from pydantic import BaseModel
# from typing import Optional
#
#
# class ParseRequest(BaseModel):
#     """Request to parse a PDF with a specific unit."""
#     unit_id: str
#     y_tolerance: float = 3.0
#     run_validation: bool = True
#
#
# class UnitInfo(BaseModel):
#     """Parsing unit metadata for dropdown population."""
#     unit_id: str
#     unit_name: str
#     version: str
#     description: str
#
#
# class ValidationRuleInfo(BaseModel):
#     """Validation rule metadata."""
#     rule_id: str
#     rule_name: str
#     severity: str
#
#
# class ParseResponse(BaseModel):
#     """Complete parse response."""
#     success: bool
#     header: dict
#     lines: list[dict]
#     warnings: list[dict]
#     validation_results: list[dict]
#     parser_unit: str
#     parsed_at: str
#     source_file_name: str
