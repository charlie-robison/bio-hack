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
from synthetic_data_gen.sample_data_loader import SampleDataLoader

logging.basicConfig(level=logging.INFO)

app = FastAPI(title="BioFact API")
sample_loader = SampleDataLoader()

api_key = os.environ.get("ANTHROPIC_API_KEY")
pipeline = SyntheticDataPipeline(api_key=api_key) if api_key else None

OUTPUT_DIR = Path(__file__).parent / "output"
OUTPUT_DIR.mkdir(exist_ok=True)

# CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class GenerateFromSchemaRequest(BaseModel):
    experiment_schema: ExperimentSchema
    num_rows: int = Field(default=100, ge=1, le=5000)


def _flatten_and_save(result: GenerationResult, run_folder_path: str | None = None) -> list:
    """Flatten GenerationResult, save to JSON file, and return response."""
    data = []
    for row in result.rows:
        flat = {"row_index": row.row_index}
        if row.group:
            flat["group"] = row.group
        flat.update(row.data)
        data.append(flat)

    if run_folder_path:
        output_file = Path(run_folder_path) / "synthetic_data.json"
    else:
        title_slug = result.experiment_schema.title[:50].replace(" ", "_").lower()
        title_slug = "".join(c for c in title_slug if c.isalnum() or c == "_")
        output_file = OUTPUT_DIR / f"{title_slug}.json"

    with open(output_file, "w") as f:
        json.dump(data, f, indent=2, default=str)

    logger = logging.getLogger(__name__)
    logger.info(f"Saved {len(data)} rows to {output_file}")

    return data


@app.get("/")
def root():
    return {"message": "BioFact API", "endpoints": ["/api/upload", "/api/runs", "/synthetic/from-pdf", "/alphafold/proteins", "/tamarind/models"]}


@app.get("/health")
def health():
    return {"status": "ok"}


# ── PDF Upload / Processing ──────────────────────────────────────────────


@app.post("/api/upload")
async def upload_pdf(file: UploadFile = File(...)):
    """Upload a PDF for processing."""
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

    if not str(full_path.resolve()).startswith(run["run_path"]):
        return {"error": "Invalid path"}

    return FileResponse(full_path)


# ── Synthetic Data Generation ────────────────────────────────────────────


@app.post("/synthetic/from-pdf")
def generate_from_pdf(
    run_id: str = Form(...),
    num_rows: int = Form(100),
):
    """
    Generate synthetic experimental data from a previously uploaded PDF.

    Reads original.pdf from the run folder identified by run_id.
    Saves synthetic_data.json into the run folder.
    """
    run_folder = Path(__file__).parent / "fs" / "runs" / run_id
    if not run_folder.exists():
        raise HTTPException(status_code=404, detail=f"Run '{run_id}' not found")

    pdf_path = run_folder / "original.pdf"
    if not pdf_path.exists():
        raise HTTPException(status_code=404, detail=f"No original.pdf in run '{run_id}'")

    try:
        result = pipeline.run(str(pdf_path), num_rows=num_rows, run_folder_path=str(run_folder))
        data = _flatten_and_save(result, run_folder_path=str(run_folder))
        response = {"data": data, "total_rows": len(data)}
        if result.experiment_schema.selected_model:
            response["selected_model"] = result.experiment_schema.selected_model
        return response
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/synthetic/extract-schema")
async def extract_schema(file: UploadFile = File(...)):
    """Upload a PDF and extract only the experiment schema (Step 1 only)."""
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
    """Generate synthetic data from a pre-existing experiment schema (Step 2 only)."""
    try:
        result = pipeline.run_from_schema(request.experiment_schema, num_rows=request.num_rows)
        return _flatten_and_save(result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── AlphaFold Sample Data ────────────────────────────────────────────────


@app.get("/alphafold/proteins")
def list_proteins():
    """List all sample proteins available for AlphaFold predictions."""
    proteins = sample_loader.list_proteins()
    return [
        {
            "protein_id": p.protein_id,
            "name": p.name,
            "organism": p.organism,
            "sequence_length": p.sequence_length,
            "tags": p.tags,
        }
        for p in proteins
    ]


@app.get("/alphafold/proteins/{protein_id}")
def get_protein(protein_id: str):
    """Get full protein data including sequence and metadata."""
    protein = sample_loader.get_protein(protein_id)
    if not protein:
        raise HTTPException(status_code=404, detail=f"Protein {protein_id} not found")
    return protein.model_dump()


@app.post("/alphafold/predict")
def predict_structure(request: dict):
    """Submit a structure prediction request (returns sample output for now)."""
    sequence = request.get("sequence", "")
    version = request.get("version", "alphafold2")

    if not sequence:
        raise HTTPException(status_code=400, detail="sequence is required")

    if version == "alphafold3":
        return sample_loader.get_sample_output("af3_prediction_result")
    return sample_loader.get_sample_output("af2_monomer_result")


@app.get("/alphafold/config/af2")
def get_af2_config():
    """Get a sample AlphaFold 2 monomer prediction configuration."""
    return sample_loader.get_af2_config("af2_monomer_config")


@app.get("/alphafold/config/af3")
def get_af3_config():
    """Get a sample AlphaFold 3 Server API prediction request."""
    return sample_loader.get_af3_request("af3_prediction_request")


@app.get("/alphafold/results/sample")
def get_sample_result():
    """Get a sample AlphaFold 2 monomer prediction result."""
    return sample_loader.get_sample_output("af2_monomer_result")


@app.get("/alphafold/results/multimer")
def get_multimer_result():
    """Get a sample AlphaFold 2 multimer prediction result."""
    return sample_loader.get_sample_output("af2_multimer_result")


@app.get("/alphafold/results/af3")
def get_af3_result():
    """Get a sample AlphaFold 3 prediction result."""
    return sample_loader.get_sample_output("af3_prediction_result")


@app.get("/alphafold/results/kras-g12d")
def get_kras_g12d_result():
    """Get the KRAS G12D specific AF2 prediction result."""
    return sample_loader.get_sample_output("kras_g12d_af2_result")


@app.get("/alphafold/confidence-guide")
def get_confidence_guide():
    """Get the AlphaFold confidence metrics reference guide."""
    return sample_loader.get_confidence_guide()


# ── Paper vs Prediction Comparison ───────────────────────────────────────


@app.get("/alphafold/compare/kras-g12d")
def get_kras_comparison():
    """Get the pre-computed KRAS G12D paper comparison results."""
    path = Path(__file__).parent / "sample_data" / "alphafold_outputs" / "kras_g12d_paper_comparison.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="KRAS G12D comparison not yet generated")
    return json.loads(path.read_text())


@app.post("/alphafold/compare")
async def compare_with_paper(file: UploadFile = File(...)):
    """Upload a research paper PDF and compare its structural claims against AlphaFold prediction results."""
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="File must be a PDF")

    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        from openai import OpenAI

        paper_text = pipeline.parser.parse(tmp_path) if pipeline else _read_pdf_text(tmp_path)

        af2_mono = sample_loader.get_sample_output("af2_monomer_result")
        af2_multi = sample_loader.get_sample_output("af2_multimer_result")
        af3_result = sample_loader.get_sample_output("af3_prediction_result")

        prediction_context = json.dumps({
            "af2_monomer": af2_mono,
            "af2_multimer": af2_multi,
            "af3": af3_result,
        }, indent=2)

        client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

        prompt = f"""You are a structural biology expert. Analyze this research paper and compare its claims against AlphaFold prediction results.

RESEARCH PAPER TEXT:
{paper_text[:15000]}

ALPHAFOLD PREDICTION RESULTS:
{prediction_context}

Return a JSON object with this exact structure:
{{
  "paper_title": "title extracted from paper",
  "proteins_mentioned": ["list of protein names found in the paper"],
  "paper_claims": [
    {{
      "claim": "specific structural or functional claim from the paper",
      "category": "structure|binding|function|stability|mutation",
      "evidence_type": "experimental|computational|literature"
    }}
  ],
  "comparisons": [
    {{
      "claim": "the paper claim being evaluated",
      "prediction_match": "which AlphaFold result is relevant (af2_monomer, af2_multimer, or af3)",
      "agreement": "agrees|partially_agrees|disagrees|not_comparable",
      "confidence": "high|medium|low",
      "explanation": "detailed explanation"
    }}
  ],
  "overall_assessment": {{
    "summary": "2-3 sentence overall assessment",
    "prediction_reliability": "high|medium|low",
    "key_agreements": ["list"],
    "key_discrepancies": ["list"],
    "recommendations": ["list"]
  }}
}}

Return ONLY valid JSON, no markdown fences."""

        response = client.chat.completions.create(
            model="gpt-5.4",
            messages=[
                {"role": "system", "content": "You are a structural biology expert. Always respond with valid JSON only."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.2,
        )

        raw_text = response.choices[0].message.content.strip()
        if raw_text.startswith("```"):
            raw_text = raw_text.split("\n", 1)[1]
            if raw_text.endswith("```"):
                raw_text = raw_text[:-3]

        comparison = json.loads(raw_text)
        return comparison

    except json.JSONDecodeError:
        return {"error": "Failed to parse OpenAI response as JSON", "raw_response": raw_text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        os.unlink(tmp_path)


<<<<<<< HEAD
# ── Tamarind Bio Models & Validation Pipeline ────────────────────────────

MODELS_DIR = Path(__file__).parent / "models"
EXPERIMENTS_DIR = Path(__file__).parent / "sample_data" / "experiments"
=======
@app.get("/alphafold/results/kras-g12d")
def get_kras_g12d_result():
    """Get the KRAS G12D specific AF2 prediction result."""
    return sample_loader.get_sample_output("kras_g12d_af2_result")


@app.get("/alphafold/compare/kras-g12d")
def get_kras_comparison():
    """Get the pre-computed KRAS G12D paper comparison results."""
    path = Path(__file__).parent / "sample_data" / "alphafold_outputs" / "kras_g12d_paper_comparison.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="KRAS G12D comparison not yet generated")
    return json.loads(path.read_text())


# ── Tamarind Bio Validation Pipeline ─────────────────────────────────────

TAMARIND_DIR = Path(__file__).parent / "sample_data" / "tamarind"
>>>>>>> 74bc1f3 (inference)


@app.get("/tamarind/models")
def list_tamarind_models():
<<<<<<< HEAD
    """List all available Tamarind Bio models from Kaushik's catalog."""
    index_path = MODELS_DIR / "index.json"
    if not index_path.exists():
        raise HTTPException(status_code=404, detail="Model index not found")
    return json.loads(index_path.read_text())


@app.get("/tamarind/models/{category}/{slug}")
def get_tamarind_model(category: str, slug: str):
    """Get a specific model definition."""
    path = MODELS_DIR / category / slug / "model.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Model {category}/{slug} not found")
    return json.loads(path.read_text())


@app.get("/tamarind/experiments")
def list_experiments():
    """List all experiments."""
    if not EXPERIMENTS_DIR.exists():
        return []
    return [
        {"id": d.name, "has_pipeline": (d / "pipeline.json").exists(), "has_validation": (d / "validation.json").exists()}
        for d in sorted(EXPERIMENTS_DIR.iterdir()) if d.is_dir()
    ]


@app.get("/tamarind/experiments/{experiment_id}/pipeline")
def get_experiment_pipeline(experiment_id: str):
    """Get an experiment's pipeline definition."""
    path = EXPERIMENTS_DIR / experiment_id / "pipeline.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Pipeline for {experiment_id} not found")
    return json.loads(path.read_text())


@app.get("/tamarind/experiments/{experiment_id}/inputs")
def list_experiment_inputs(experiment_id: str):
    """List all inputs for an experiment."""
    inputs_dir = EXPERIMENTS_DIR / experiment_id / "inputs"
    if not inputs_dir.exists():
        return []
    return [
        {"file": f.name, "model_slug": json.loads(f.read_text()).get("model_slug")}
=======
    """List all available Tamarind Bio models."""
    catalog = json.loads((TAMARIND_DIR / "models" / "catalog.json").read_text())
    return catalog


@app.get("/tamarind/pipeline/{pipeline_id}")
def get_pipeline(pipeline_id: str):
    """Get a validation pipeline definition."""
    path = TAMARIND_DIR / "pipeline" / f"{pipeline_id}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Pipeline {pipeline_id} not found")
    return json.loads(path.read_text())


@app.get("/tamarind/inputs")
def list_tamarind_inputs():
    """List all sample inputs."""
    inputs_dir = TAMARIND_DIR / "inputs"
    return [
        {"file": f.name, "model": json.loads(f.read_text()).get("model")}
>>>>>>> 74bc1f3 (inference)
        for f in sorted(inputs_dir.glob("*.json"))
    ]


<<<<<<< HEAD
@app.get("/tamarind/experiments/{experiment_id}/inputs/{filename}")
def get_experiment_input(experiment_id: str, filename: str):
    """Get a specific experiment input."""
    path = EXPERIMENTS_DIR / experiment_id / "inputs" / filename
=======
@app.get("/tamarind/inputs/{filename}")
def get_tamarind_input(filename: str):
    """Get a specific sample input."""
    path = TAMARIND_DIR / "inputs" / filename
>>>>>>> 74bc1f3 (inference)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Input not found")
    return json.loads(path.read_text())


<<<<<<< HEAD
@app.get("/tamarind/experiments/{experiment_id}/outputs")
def list_experiment_outputs(experiment_id: str):
    """List all outputs for an experiment."""
    outputs_dir = EXPERIMENTS_DIR / experiment_id / "outputs"
    if not outputs_dir.exists():
        return []
    return [
        {"file": f.name, "model_slug": json.loads(f.read_text()).get("model_slug"), "status": json.loads(f.read_text()).get("status")}
=======
@app.get("/tamarind/outputs")
def list_tamarind_outputs():
    """List all sample outputs."""
    outputs_dir = TAMARIND_DIR / "outputs"
    return [
        {
            "file": f.name,
            "model": json.loads(f.read_text()).get("model"),
            "status": json.loads(f.read_text()).get("status"),
        }
>>>>>>> 74bc1f3 (inference)
        for f in sorted(outputs_dir.glob("*.json"))
    ]


<<<<<<< HEAD
@app.get("/tamarind/experiments/{experiment_id}/outputs/{filename}")
def get_experiment_output(experiment_id: str, filename: str):
    """Get a specific experiment output."""
    path = EXPERIMENTS_DIR / experiment_id / "outputs" / filename
=======
@app.get("/tamarind/outputs/{filename}")
def get_tamarind_output(filename: str):
    """Get a specific sample output."""
    path = TAMARIND_DIR / "outputs" / filename
>>>>>>> 74bc1f3 (inference)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Output not found")
    return json.loads(path.read_text())


<<<<<<< HEAD
@app.get("/tamarind/experiments/{experiment_id}/validation")
def get_experiment_validation(experiment_id: str):
    """Get the unified validation results for an experiment."""
    path = EXPERIMENTS_DIR / experiment_id / "validation.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Validation for {experiment_id} not found")
=======
@app.get("/tamarind/validation/{validation_id}")
def get_validation(validation_id: str):
    """Get the unified validation comparison results."""
    path = TAMARIND_DIR / "comparison" / f"{validation_id}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Validation not found")
>>>>>>> 74bc1f3 (inference)
    return json.loads(path.read_text())


def _read_pdf_text(path: str) -> str:
    """Fallback PDF reader when the full pipeline isn't available."""
    try:
        from PyPDF2 import PdfReader
        reader = PdfReader(path)
        return "\n".join(page.extract_text() or "" for page in reader.pages)
    except Exception:
        return ""
