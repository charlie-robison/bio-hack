"""
Experiment Runner
=================

Full pipeline for validating a research paper using Tamarind Bio models:

    PDF → Parse → Plan experiments → Generate inputs → Submit to Tamarind → Poll → Download → Validate

Uses Claude Opus to analyze the paper, determine which Tamarind models to run,
and generate the correct input settings for each model. Then submits jobs to
the Tamarind Bio API, polls for completion, and stores all results.
"""

from __future__ import annotations

import json
import logging
import os
import time
import uuid
from pathlib import Path

from anthropic import Anthropic

from synthetic_data_gen.model_catalog import load_model_index, format_index_for_prompt
from synthetic_data_gen.paper_parser import PaperParser
from tamarind_client import TamarindClient

logger = logging.getLogger(__name__)

EXPERIMENTS_DIR = Path(__file__).parent / "sample_data" / "experiments"


PLANNER_SYSTEM_PROMPT = """\
You are an expert computational biologist. Given a research paper and a catalog \
of available computational biology models, your job is to design a multi-model \
validation experiment that tests the paper's key claims.

For each testable claim in the paper, identify which model(s) from the catalog \
can validate it. Group the models into ordered stages (e.g., structure prediction \
first, then docking, then dynamics). For each model, generate the EXACT input \
settings that should be submitted to the Tamarind Bio API.

CRITICAL RULES for generating settings:
- The "type" field must match the model's tool name exactly (e.g., "alphafold", \
"diffdock", "boltz", "chai", "gnina", "autodock-vina", "openmm", "prodigy", "esmfold")
- For file inputs (PDB, SDF), use the string "FROM_PREVIOUS_STAGE" if the file \
comes from a prior model's output, or provide the actual data/reference if known.
- For protein sequences, extract the actual sequence from the paper if available.
- For ligand SMILES, extract or look up the actual SMILES from the paper.
- For docking box coordinates, estimate from the binding site description in the paper.
- Include only settings that are relevant. Use defaults for optional settings.
- Each job needs a unique "jobName" field.

Return ONLY valid JSON.\
"""

PLANNER_USER_PROMPT = """\
Analyze this research paper and design a validation experiment using the \
available Tamarind Bio models.

AVAILABLE TOOLS (from Tamarind Bio API):
{tools_json}

AVAILABLE MODEL CATALOG (for reference on capabilities):
{model_catalog}

RESEARCH PAPER:
{paper_text}

Return a JSON object with this structure:
{{
    "experiment_id": "short_snake_case_id",
    "paper_title": "title from paper",
    "paper_journal": "journal name if found",
    "hypothesis": "what the paper claims",
    "stages": [
        {{
            "stage_number": 1,
            "stage_name": "descriptive name",
            "description": "what this stage validates",
            "jobs": [
                {{
                    "jobName": "unique-job-name",
                    "type": "tool_name",
                    "description": "what this specific job tests",
                    "settings": {{ ... exact settings for the Tamarind API ... }},
                    "validates_claims": ["which paper claims this tests"],
                    "depends_on": ["jobName of prerequisite job, or empty"]
                }}
            ]
        }}
    ],
    "claims": [
        {{
            "claim": "specific paper claim",
            "category": "structure|binding|affinity|selectivity|mechanism|efficacy",
            "testable": true,
            "models": ["which models test this"]
        }}
    ]
}}

IMPORTANT:
- Extract actual protein sequences, ligand SMILES, PDB IDs from the paper.
- For KRAS papers: KRAS G12D sequence is MTEYKLVVVGADGVGKSALTIQLIQNHFVDEYDPTIEDSY\
RKQVVIDGETCLLDILDTAGQEEYSAMRDQYMRTGEGFLCVFAINNTKSFEDIHHQRQETKFEQEKAKTFLKTVKDSL\
WQTPKYQKLHMEHIRETVEGEVKDLIEKQKRKLEEIVNKEKQKLLNKMESEELFSSLENYIPNYNTSDDKIYPFL (169 aa, G12D = position 12 is D instead of G)
- For MRTX1133: SMILES is approximately C1CC(C1)NC(=O)C2=C(N=C(C=C2)NCC3=CC(=C(C=C3)F)F)Cl
- Use PDB 7T47 as reference structure when available.
- For docking, the Switch II pocket center is approximately x=35, y=27, z=35 with box size 20x20x20.
- If a model needs a PDB file from a previous stage, set it to "FROM_PREVIOUS_STAGE:jobName".\
"""


VALIDATOR_SYSTEM_PROMPT = """\
You are an expert computational biologist analyzing experimental results. \
Compare the computational results from multiple Tamarind Bio models against \
the claims made in a research paper. For each claim, determine if the \
computational evidence validates, partially validates, or contradicts it.

Be specific about metrics: RMSD values, binding energies, confidence scores, etc.
Return ONLY valid JSON.\
"""

VALIDATOR_USER_PROMPT = """\
Compare these computational results against the paper's claims.

PAPER TITLE: {paper_title}

PAPER CLAIMS:
{claims_json}

COMPUTATIONAL RESULTS:
{results_json}

Return a JSON object with this structure:
{{
    "validation_id": "experiment_id_validation",
    "paper_title": "{paper_title}",
    "models_used": ["list of model slugs used"],
    "overall_reliability_score": 0.0 to 1.0,
    "claims_validated": [
        {{
            "claim": "the claim text",
            "category": "category",
            "paper_evidence": "what the paper says",
            "models_tested": ["models that tested this"],
            "result": "validated|partially_validated|not_testable|invalidated",
            "confidence": "high|medium|low",
            "evidence": {{ ... key metrics from results ... }},
            "conclusion": "1-2 sentence conclusion"
        }}
    ],
    "aggregate_results": {{
        "total_claims": N,
        "validated": N,
        "partially_validated": N,
        "not_testable": N,
        "invalidated": N,
        "validation_rate": 0.0 to 1.0,
        "validation_summary": "X of Y claims supported"
    }},
    "model_agreement_matrix": {{ ... cross-model agreement data ... }},
    "final_verdict": {{
        "paper_validity": "strongly_supported|supported|mixed|weakly_supported|contradicted",
        "reliability_score": 0.0 to 1.0,
        "summary": "2-3 sentence summary",
        "confidence_factors": ["list"],
        "remaining_gaps": ["list"]
    }}
}}\
"""


class ExperimentRunner:
    """
    Orchestrates the full paper validation pipeline:
    1. Parse paper
    2. Plan experiments (Claude Opus)
    3. Submit jobs to Tamarind Bio
    4. Poll for completion
    5. Download and store results
    6. Validate against paper claims (Claude Opus)
    """

    def __init__(
        self,
        anthropic_api_key: str | None = None,
        tamarind_api_key: str | None = None,
    ):
        self.anthropic = Anthropic(api_key=anthropic_api_key)
        self.tamarind = TamarindClient(api_key=tamarind_api_key)
        self.parser = PaperParser()
        self._model_index = load_model_index()
        self._model_index_text = format_index_for_prompt(self._model_index)
        self._tools_cache: list[dict] | None = None

    def _get_tools(self) -> list[dict]:
        """Get Tamarind tools list (cached)."""
        if self._tools_cache is None:
            self._tools_cache = self.tamarind.list_tools()
        return self._tools_cache

    def _get_relevant_tools_json(self) -> str:
        """Get JSON of tools relevant for paper validation."""
        tools = self._get_tools()
        relevant_names = {
            "alphafold", "esmfold", "diffdock", "gnina", "autodock-vina",
            "boltz", "chai", "openmm", "prodigy",
        }
        relevant = [t for t in tools if t["name"] in relevant_names]
        return json.dumps(relevant, indent=2)

    # ── Step 1: Parse paper ──────────────────────────────────────────

    def parse_paper(self, paper_path: str) -> str:
        """Parse a PDF/text file into clean text."""
        return self.parser.parse(paper_path)

    def parse_paper_from_text(self, text: str) -> str:
        """Clean raw paper text."""
        return self.parser.parse_from_string(text)

    # ── Step 2: Plan experiments ─────────────────────────────────────

    def plan_experiment(self, paper_text: str) -> dict:
        """
        Use Claude Opus to analyze the paper and produce an experiment plan
        with specific Tamarind jobs and settings.
        """
        logger.info("Planning experiment with Claude Opus...")

        prompt = PLANNER_USER_PROMPT.format(
            tools_json=self._get_relevant_tools_json(),
            model_catalog=self._model_index_text,
            paper_text=paper_text[:30000],  # Truncate very long papers
        )

        response = self.anthropic.messages.create(
            model="claude-opus-4-20250514",
            max_tokens=8192,
            system=PLANNER_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": prompt}],
        )

        raw = response.content[0].text
        plan = self._parse_json(raw)
        logger.info(
            f"Planned experiment: {plan.get('experiment_id')} "
            f"with {sum(len(s.get('jobs', [])) for s in plan.get('stages', []))} jobs"
        )
        return plan

    # ── Step 3: Submit jobs ──────────────────────────────────────────

    def submit_experiment(self, plan: dict, experiment_dir: Path) -> dict:
        """
        Submit all jobs from the experiment plan to Tamarind Bio.
        Saves the plan and tracks job submissions.

        Returns the plan with submission status added to each job.
        """
        experiment_dir.mkdir(parents=True, exist_ok=True)
        inputs_dir = experiment_dir / "inputs"
        inputs_dir.mkdir(exist_ok=True)

        # Save the plan
        (experiment_dir / "pipeline.json").write_text(json.dumps(plan, indent=2))

        for stage in plan.get("stages", []):
            for job in stage.get("jobs", []):
                job_name = job["jobName"]
                tool_type = job["type"]
                settings = job["settings"]

                # Resolve dependencies (replace FROM_PREVIOUS_STAGE references)
                settings = self._resolve_dependencies(settings, plan, experiment_dir)

                # Save input
                input_file = inputs_dir / f"{tool_type}_{job_name}.json"
                input_file.write_text(json.dumps({
                    "jobName": job_name,
                    "type": tool_type,
                    "settings": settings,
                }, indent=2))

                # Submit to Tamarind
                try:
                    result = self.tamarind.submit_job(job_name, tool_type, settings)
                    job["submission_status"] = "submitted"
                    job["submission_response"] = result
                    logger.info(f"Submitted {job_name} ({tool_type})")
                except Exception as e:
                    job["submission_status"] = "failed"
                    job["submission_error"] = str(e)
                    logger.error(f"Failed to submit {job_name}: {e}")

        # Update plan with submission status
        (experiment_dir / "pipeline.json").write_text(json.dumps(plan, indent=2))
        return plan

    def _resolve_dependencies(self, settings: dict, plan: dict, experiment_dir: Path) -> dict:
        """Replace FROM_PREVIOUS_STAGE references with actual file paths."""
        resolved = {}
        for key, value in settings.items():
            if isinstance(value, str) and value.startswith("FROM_PREVIOUS_STAGE"):
                # Format: FROM_PREVIOUS_STAGE:jobName
                parts = value.split(":")
                if len(parts) >= 2:
                    dep_job = parts[1]
                    # Reference the output from the dependency job
                    resolved[key] = f"{dep_job}/best_model.pdb"
                else:
                    resolved[key] = value
            else:
                resolved[key] = value
        return resolved

    # ── Step 4: Poll for completion ──────────────────────────────────

    def poll_experiment(self, plan: dict, poll_interval: float = 30.0, max_wait: float = 7200.0) -> dict:
        """
        Poll all jobs until complete. Returns updated plan with statuses.
        """
        all_jobs = []
        for stage in plan.get("stages", []):
            for job in stage.get("jobs", []):
                if job.get("submission_status") == "submitted":
                    all_jobs.append(job)

        if not all_jobs:
            logger.warning("No submitted jobs to poll")
            return plan

        logger.info(f"Polling {len(all_jobs)} jobs...")
        start = time.time()
        pending = set(j["jobName"] for j in all_jobs)

        while pending and (time.time() - start) < max_wait:
            jobs_data = self.tamarind.get_jobs()
            job_statuses = {}
            for j in jobs_data.get("jobs", []):
                name = j.get("jobName") or j.get("name")
                if name:
                    job_statuses[name] = j.get("status", "unknown")

            newly_done = set()
            for job_name in pending:
                status = job_statuses.get(job_name)
                if status == "Complete":
                    logger.info(f"Job '{job_name}' completed")
                    newly_done.add(job_name)
                elif status == "Stopped":
                    logger.error(f"Job '{job_name}' stopped/failed")
                    newly_done.add(job_name)
                else:
                    logger.info(f"Job '{job_name}' status: {status or 'not found'}")

            pending -= newly_done

            # Update plan
            for stage in plan.get("stages", []):
                for job in stage.get("jobs", []):
                    if job["jobName"] in job_statuses:
                        job["final_status"] = job_statuses[job["jobName"]]

            if pending:
                time.sleep(poll_interval)

        if pending:
            logger.warning(f"Timed out waiting for: {pending}")

        return plan

    # ── Step 5: Download results ─────────────────────────────────────

    def download_results(self, plan: dict, experiment_dir: Path) -> dict:
        """
        Download results for all completed jobs.
        Returns updated plan with result file paths.
        """
        outputs_dir = experiment_dir / "outputs"
        outputs_dir.mkdir(exist_ok=True)

        for stage in plan.get("stages", []):
            for job in stage.get("jobs", []):
                if job.get("final_status") != "Complete":
                    continue

                job_name = job["jobName"]
                try:
                    saved = self.tamarind.download_result_files(job_name, outputs_dir)
                    job["result_files"] = [str(p) for p in saved]
                    logger.info(f"Downloaded results for {job_name}: {saved}")
                except Exception as e:
                    job["download_error"] = str(e)
                    logger.error(f"Failed to download results for {job_name}: {e}")

        # Update plan
        (experiment_dir / "pipeline.json").write_text(json.dumps(plan, indent=2))
        return plan

    # ── Step 6: Validate against paper ───────────────────────────────

    def validate_results(self, plan: dict, paper_text: str, experiment_dir: Path) -> dict:
        """
        Use Claude Opus to compare computational results against paper claims.
        Generates and saves a validation.json file.
        """
        outputs_dir = experiment_dir / "outputs"

        # Collect all results
        results = {}
        if outputs_dir.exists():
            for f in outputs_dir.glob("*.json"):
                try:
                    results[f.stem] = json.loads(f.read_text())
                except Exception:
                    pass

        claims = plan.get("claims", [])
        if not claims:
            # Extract claims from stages
            for stage in plan.get("stages", []):
                for job in stage.get("jobs", []):
                    for c in job.get("validates_claims", []):
                        claims.append({"claim": c, "category": "general", "testable": True})

        prompt = VALIDATOR_USER_PROMPT.format(
            paper_title=plan.get("paper_title", "Unknown"),
            claims_json=json.dumps(claims, indent=2),
            results_json=json.dumps(results, indent=2)[:20000],  # Truncate if huge
        )

        logger.info("Validating results with Claude Opus...")
        response = self.anthropic.messages.create(
            model="claude-opus-4-20250514",
            max_tokens=8192,
            system=VALIDATOR_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": prompt}],
        )

        raw = response.content[0].text
        validation = self._parse_json(raw)

        # Save validation
        (experiment_dir / "validation.json").write_text(json.dumps(validation, indent=2))
        logger.info(f"Validation saved. Score: {validation.get('overall_reliability_score', 'N/A')}")
        return validation

    # ── Full pipeline ────────────────────────────────────────────────

    def run(self, paper_path: str, experiment_id: str | None = None) -> dict:
        """
        Run the full pipeline end-to-end:
        1. Parse paper
        2. Plan experiments
        3. Submit to Tamarind
        4. Poll for completion
        5. Download results
        6. Validate against paper

        Args:
            paper_path: Path to the research paper PDF.
            experiment_id: Optional ID. Auto-generated if not provided.

        Returns:
            Dict with experiment_id, plan, validation, and experiment_dir.
        """
        # Parse
        paper_text = self.parse_paper(paper_path)
        logger.info(f"Parsed paper: {len(paper_text)} chars")

        # Plan
        plan = self.plan_experiment(paper_text)
        if not experiment_id:
            experiment_id = plan.get("experiment_id", f"exp_{uuid.uuid4().hex[:8]}")

        experiment_dir = EXPERIMENTS_DIR / experiment_id
        experiment_dir.mkdir(parents=True, exist_ok=True)

        # Save paper text for reference
        (experiment_dir / "paper_text.txt").write_text(paper_text[:50000])

        # Submit
        plan = self.submit_experiment(plan, experiment_dir)

        # Poll
        plan = self.poll_experiment(plan)

        # Download
        plan = self.download_results(plan, experiment_dir)

        # Validate
        validation = self.validate_results(plan, paper_text, experiment_dir)

        return {
            "experiment_id": experiment_id,
            "experiment_dir": str(experiment_dir),
            "plan": plan,
            "validation": validation,
        }

    def run_from_text(self, paper_text: str, experiment_id: str | None = None) -> dict:
        """Same as run() but from raw text instead of a file path."""
        paper_text = self.parse_paper_from_text(paper_text)

        plan = self.plan_experiment(paper_text)
        if not experiment_id:
            experiment_id = plan.get("experiment_id", f"exp_{uuid.uuid4().hex[:8]}")

        experiment_dir = EXPERIMENTS_DIR / experiment_id
        experiment_dir.mkdir(parents=True, exist_ok=True)
        (experiment_dir / "paper_text.txt").write_text(paper_text[:50000])

        plan = self.submit_experiment(plan, experiment_dir)
        plan = self.poll_experiment(plan)
        plan = self.download_results(plan, experiment_dir)
        validation = self.validate_results(plan, paper_text, experiment_dir)

        return {
            "experiment_id": experiment_id,
            "experiment_dir": str(experiment_dir),
            "plan": plan,
            "validation": validation,
        }

    # Plan-only mode (no Tamarind submission)
    def plan_only(self, paper_path: str) -> dict:
        """Parse paper and return just the experiment plan without submitting."""
        paper_text = self.parse_paper(paper_path)
        return self.plan_experiment(paper_text)

    # ── Helpers ──────────────────────────────────────────────────────

    def _parse_json(self, raw: str) -> dict:
        """Extract and parse JSON from LLM response."""
        text = raw.strip()
        if "```json" in text:
            start = text.index("```json") + 7
            end = text.index("```", start)
            text = text[start:end].strip()
        elif "```" in text:
            start = text.index("```") + 3
            end = text.index("```", start)
            text = text[start:end].strip()
        else:
            first = text.find("{")
            last = text.rfind("}")
            if first != -1 and last != -1:
                text = text[first:last + 1]

        return json.loads(text)
