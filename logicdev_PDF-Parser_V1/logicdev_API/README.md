# logicdev_API - Dashboard Integration (Future)

This folder is prepared for a future web dashboard that will allow:

1. **PDF Upload** - Drag & drop PDF files for parsing
2. **Unit Selection** - Dropdown to choose which parsing unit to apply
3. **Visual Rule Builder** - Create parsing unit configurations via UI
4. **Validation Rules** - Configure and toggle post-parsing validation rules
5. **Result Viewer** - Display parsed data in a table with export options

## Planned Technology

- **FastAPI** for the REST API backend
- **React/Vue** for the frontend dashboard
- Endpoints: `GET /api/units`, `POST /api/parse`, `GET /api/rules`

## Integration with Core Engine

```python
from logicdev_Core import PDFEngine

engine = PDFEngine()
result = engine.parse("uploaded.pdf", unit_id="fattura_falmec_v1")
```

The `PDFEngine` API is designed to be directly callable from a web server.
All results serialize to JSON via `dataclasses.asdict()`.
