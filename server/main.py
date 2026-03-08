import logging
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from synthetic_data_gen.models import ExperimentSchema
from synthetic_data_gen.pipeline import SyntheticDataPipeline

logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Bio-Hack Synthetic Data API")
pipeline = SyntheticDataPipeline()


class GenerateFromUrlRequest(BaseModel):
    url: str = Field(..., description="URL to the research paper (HTML page or direct PDF link)")
    num_rows: int = Field(default=100, ge=1, le=5000)


class ExtractSchemaFromUrlRequest(BaseModel):
    url: str = Field(..., description="URL to the research paper")


class GenerateFromSchemaRequest(BaseModel):
    experiment_schema: ExperimentSchema
    num_rows: int = Field(default=100, ge=1, le=5000)


@app.get("/")
def root():
    return {"message": "Hello, World!"}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/synthetic/from-url")
def generate_from_url(request: GenerateFromUrlRequest):
    """
    Provide a URL to a research paper and generate synthetic experimental data.

    Step 1: Fetches the paper, Opus extracts the experiment schema.
    Step 2: Sonnet generates synthetic data rows from the schema.
    """
    try:
        result = pipeline.run_from_url(request.url, num_rows=request.num_rows)
        return result.model_dump()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/synthetic/extract-schema")
def extract_schema(request: ExtractSchemaFromUrlRequest):
    """
    Extract only the experiment schema from a paper URL (Step 1 only).

    Useful for inspecting/editing the schema before generating data.
    """
    try:
        paper_text = pipeline.parser.parse_url(request.url)
        schema = pipeline.extractor.extract(paper_text)
        return schema.model_dump()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/synthetic/from-schema")
def generate_from_schema(request: GenerateFromSchemaRequest):
    """
    Generate synthetic data from a pre-existing experiment schema (Step 2 only).

    Use this after editing a schema from /synthetic/extract-schema.
    """
    try:
        result = pipeline.run_from_schema(request.experiment_schema, num_rows=request.num_rows)
        return result.model_dump()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
