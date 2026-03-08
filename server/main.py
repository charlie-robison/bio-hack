import os
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, UploadFile, File
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path

from pdf_processor import process_pdf, get_run, list_runs

app = FastAPI(title="BioFact API")

# CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {"message": "BioFact API", "endpoints": ["/api/upload", "/api/runs"]}


@app.get("/health")
def health():
    return {"status": "ok"}


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
