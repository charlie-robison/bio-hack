import logging
import os
import tempfile
from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field
from synthetic_data_gen.models import ExperimentSchema, GenerationResult
from synthetic_data_gen.pipeline import SyntheticDataPipeline

load_dotenv()
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Bio-Hack Synthetic Data API")
pipeline = SyntheticDataPipeline(api_key=os.environ["ANTHROPIC_API_KEY"])


class GenerateFromSchemaRequest(BaseModel):
    experiment_schema: ExperimentSchema
    num_rows: int = Field(default=100, ge=1, le=5000)


def _flatten(result: GenerationResult) -> dict:
    """Flatten GenerationResult into a simple {columns, data} response."""
    columns = [col.name for col in result.experiment_schema.columns]
    data = []
    for row in result.rows:
        flat = {"row_index": row.row_index}
        if row.group:
            flat["group"] = row.group
        flat.update(row.data)
        data.append(flat)
    return {
        "title": result.experiment_schema.title,
        "total_rows": result.total_rows,
        "columns": columns,
        "data": data,
    }


@app.get("/")
def root():
    return {"message": "Hello, World!"}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/synthetic/from-pdf")
async def generate_from_pdf(
    file: UploadFile = File(...),
    num_rows: int = Form(default=100),
):
    """
    Upload a research paper PDF and generate synthetic experimental data.

    Step 1: Opus parses the PDF and extracts the experiment schema.
    Step 2: Sonnet generates synthetic data rows from the schema.
    """
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="File must be a PDF")

    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        result = pipeline.run(tmp_path, num_rows=num_rows)
        return _flatten(result)
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
        return _flatten(result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
