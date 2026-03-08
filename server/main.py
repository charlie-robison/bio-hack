import json
import logging
import os
import tempfile
from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
from pydantic import BaseModel, Field

from pdf_processor import process_pdf, get_run, list_runs
from synthetic_data_gen.models import ExperimentSchema, GenerationResult
from synthetic_data_gen.pipeline import SyntheticDataPipeline

logging.basicConfig(level=logging.INFO)

app = FastAPI(title="BioFact API")
pipeline = SyntheticDataPipeline(api_key=os.environ["ANTHROPIC_API_KEY"])

OUTPUT_DIR = Path(__file__).parent / "output"
OUTPUT_DIR.mkdir(exist_ok=True)

# CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class GenerateFromSchemaRequest(BaseModel):
    experiment_schema: ExperimentSchema
    num_rows: int = Field(default=100, ge=1, le=5000)


def _flatten_and_save(result: GenerationResult) -> dict:
    """Flatten GenerationResult, save to JSON file, and return response."""
    columns = [col.name for col in result.experiment_schema.columns]
    data = []
    for row in result.rows:
        flat = {"row_index": row.row_index}
        if row.group:
            flat["group"] = row.group
        flat.update(row.data)
        data.append(flat)

    # Save the raw data array to a JSON file
    title_slug = result.experiment_schema.title[:50].replace(" ", "_").lower()
    title_slug = "".join(c for c in title_slug if c.isalnum() or c == "_")
    output_file = OUTPUT_DIR / f"{title_slug}.json"

    with open(output_file, "w") as f:
        json.dump(data, f, indent=2, default=str)

    logger = logging.getLogger(__name__)
    logger.info(f"Saved {len(data)} rows to {output_file}")

    return {
        "title": result.experiment_schema.title,
        "total_rows": result.total_rows,
        "columns": columns,
        "output_file": str(output_file),
        "data": data,
    }


@app.get("/")
def root():
    return {"message": "BioFact API", "endpoints": ["/api/upload", "/api/runs", "/synthetic/from-pdf", "/synthetic/extract-schema", "/synthetic/from-schema"]}


@app.get("/health")
def health():
    return {"status": "ok"}


# ── PDF Upload / Processing endpoints (from main) ──

@app.post("/api/upload")
async def upload_pdf(file: UploadFile = File(...)):
    """
    Upload a PDF for processing.

    Pipeline:
    1. Save original PDF to fs/runs/{run_id}/original.pdf
    2. Convert PDF pages to PNGs
    3. Extract embedded images via pdfimages
    4. Run LlamaParse to get markdown
    5. Save metadata

    Returns run_id and processing results.
    """
    if not file.filename.lower().endswith(".pdf"):
        return {"error": "Only PDF files are supported"}

    content = await file.read()

    try:
        result = await process_pdf(file.filename, content)
        return {
            "success": True,
            "run_id": result["run_id"],
            "metadata": result["metadata"],
            "markdown_preview": result["markdown_preview"]
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.get("/api/runs")
async def api_list_runs():
    """List all processing runs."""
    return {"runs": list_runs()}


@app.get("/api/runs/{run_id}")
async def api_get_run(run_id: str):
    """Get details for a specific run."""
    run = get_run(run_id)
    if not run:
        return {"error": "Run not found"}
    return run


@app.get("/api/runs/{run_id}/markdown")
async def api_get_run_markdown(run_id: str):
    """Get the extracted markdown for a run."""
    run = get_run(run_id)
    if not run:
        return {"error": "Run not found"}
    return {"markdown": run.get("markdown", "")}


@app.get("/api/runs/{run_id}/files/{file_path:path}")
async def api_get_run_file(run_id: str, file_path: str):
    """Serve a file from a run (images, etc)."""
    run = get_run(run_id)
    if not run:
        return {"error": "Run not found"}

    full_path = Path(run["run_path"]) / file_path

    if not full_path.exists():
        return {"error": "File not found"}

    # Security: ensure path is within run directory
    if not str(full_path.resolve()).startswith(run["run_path"]):
        return {"error": "Invalid path"}

    return FileResponse(full_path)


# ── Synthetic Data Generation endpoints (from branch) ──

@app.post("/synthetic/from-pdf")
async def generate_from_pdf(
    file: UploadFile = File(...),
    num_rows: int = Form(default=100),
    run_id: str = Form(default=None),
):
    """
    Upload a research paper PDF and generate synthetic experimental data.

    Step 1: Opus parses the PDF and extracts the experiment schema.
    Step 2: Sonnet generates synthetic data rows from the schema.

    Optionally pass a run_id from a previous /api/upload to give the
    schema extractor access to the parsed run folder (content.md, images, etc.).
    """
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="File must be a PDF")

    # Resolve the run folder path if a run_id was provided
    run_folder_path = None
    if run_id:
        candidate = Path(__file__).parent / "fs" / "runs" / run_id
        if candidate.exists():
            run_folder_path = str(candidate)
        else:
            raise HTTPException(status_code=404, detail=f"Run '{run_id}' not found")

    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        result = pipeline.run(tmp_path, num_rows=num_rows, run_folder_path=run_folder_path)
        return _flatten_and_save(result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        os.unlink(tmp_path)


@app.post("/synthetic/extract-schema")
async def extract_schema(file: UploadFile = File(...)):
    """
    Upload a PDF and extract only the experiment schema (Step 1 only).

    Useful for inspecting/editing the schema before generating data.
    """
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="File must be a PDF")

    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        paper_text = pipeline.parser.parse(tmp_path)
        schema = pipeline.extractor.extract(paper_text)
        return schema.model_dump()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        os.unlink(tmp_path)


@app.post("/synthetic/from-schema")
def generate_from_schema(request: GenerateFromSchemaRequest):
    """
    Generate synthetic data from a pre-existing experiment schema (Step 2 only).

    Use this after editing a schema from /synthetic/extract-schema.
    """
    try:
        result = pipeline.run_from_schema(request.experiment_schema, num_rows=request.num_rows)
        return _flatten_and_save(result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
