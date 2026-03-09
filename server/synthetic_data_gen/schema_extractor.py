"""
Schema Extractor (Step 1b)
==========================

Uses GPT-4.1 to analyze a research paper and extract a structured
experiment schema. Identifies variables, infers distributions, and
maps out relationships between variables.
"""

from __future__ import annotations
import json
import logging
import os
from pathlib import Path
from openai import OpenAI
from synthetic_data_gen.models import ExperimentSchema
from synthetic_data_gen.model_catalog import (
    load_model_index,
    format_index_for_prompt,
    load_model_by_slug,
)

logger = logging.getLogger(__name__)

EXTRACTION_SYSTEM_PROMPT = """\
You are an expert research methodologist and data scientist. Your job is to \
analyze a research paper and extract a complete, structured experiment schema \
that can be used to generate realistic synthetic data.

You must identify:
1. The core hypothesis and methodology
2. All independent, dependent, and control variables
3. For each variable: its type, plausible range, distribution, and units
4. Relationships and correlations between variables
5. Experimental group definitions (if applicable)
6. Any constraints that synthetic data must satisfy to be realistic

Be precise about statistical distributions. If the paper reports means and \
standard deviations, use those. If not, infer plausible distributions from \
the domain (e.g., age is typically normal, reaction times are log-normal, \
counts are Poisson).

Return your analysis as a JSON object matching the provided schema exactly.\
"""

EXTRACTION_SYSTEM_PROMPT_WITH_MODELS = """\
You are an expert research methodologist, data scientist, and bioinformatics \
specialist. Your job is to analyze a research paper and:

1. Select the most appropriate computational model from the available model \
catalog that could be used to analyze or extend the experiment described in \
the paper.
2. Extract a complete, structured experiment schema where the generated \
synthetic data columns are formatted to match the selected model's expected \
inputs — so the data can be directly fed into that model.

When selecting a model:
- Choose the model whose capabilities best match the paper's domain and \
experimental methodology.
- Consider what the paper is studying (proteins, enzymes, antibodies, small \
molecules, etc.) and match it to the model's specialty.
- If multiple models could work, pick the one most directly relevant.

When defining columns:
- The columns MUST include all required inputs for the selected model, using \
the EXACT input field names the model expects (e.g. if the model input is \
called "sequence", the column name must be "sequence" — not "protein_sequence" \
or any variation). This is critical for the pipeline to work.
- These model-input columns must come FIRST in the columns array.
- Additional experiment-specific columns from the paper can be included after.
- For file-type inputs (e.g., PDB files), represent them as text columns \
containing file paths or content identifiers.

Be precise about statistical distributions. If the paper reports means and \
standard deviations, use those. If not, infer plausible distributions from \
the domain.

Return your analysis as a JSON object matching the provided schema exactly.\
"""

EXTRACTION_USER_PROMPT = """\
Analyze the following research paper and extract a complete experiment schema \
for synthetic data generation.

Return a JSON object with this exact structure:
{{
    "title": "paper title",
    "experiment_summary": "brief description of the experiment",
    "hypothesis": "the research hypothesis",
    "methodology": "experimental methodology description",
    "sample_size": <original sample size or null>,
    "independent_variables": ["var1", "var2"],
    "dependent_variables": ["var1", "var2"],
    "control_variables": ["var1", "var2"],
    "columns": [
        {{
            "name": "variable_name_snake_case",
            "description": "what this variable represents",
            "column_type": "numeric|categorical|text|boolean|datetime",
            "unit": "unit or null",
            "distribution": "normal|uniform|log_normal|poisson|binomial|exponential|custom",
            "min_value": <number or null>,
            "max_value": <number or null>,
            "mean": <number or null>,
            "std_dev": <number or null>,
            "categories": ["cat1", "cat2"] or null,
            "constraints": ["constraint1", "constraint2"]
        }}
    ],
    "relationships": [
        "description of relationship between variables"
    ],
    "group_definitions": {{
        "group_name": "group_description"
    }},
    "notes": ["additional context for data generation"]
}}

RESEARCH PAPER:
{paper_text}\
"""

EXTRACTION_USER_PROMPT_WITH_MODELS = """\
Analyze the following research paper and extract a complete experiment schema \
for synthetic data generation.

IMPORTANT: You must also select the best matching computational model from the \
catalog below. The synthetic data columns MUST be structured so each row can \
be directly used as input to the selected model.

AVAILABLE MODELS CATALOG:
{model_catalog}

Return a JSON object with this exact structure:
{{
    "title": "paper title",
    "experiment_summary": "brief description of the experiment",
    "hypothesis": "the research hypothesis",
    "methodology": "experimental methodology description",
    "sample_size": <original sample size or null>,
    "independent_variables": ["var1", "var2"],
    "dependent_variables": ["var1", "var2"],
    "control_variables": ["var1", "var2"],
    "columns": [
        {{
            "name": "variable_name_snake_case",
            "description": "what this variable represents",
            "column_type": "numeric|categorical|text|boolean|datetime",
            "unit": "unit or null",
            "distribution": "normal|uniform|log_normal|poisson|binomial|exponential|custom",
            "min_value": <number or null>,
            "max_value": <number or null>,
            "mean": <number or null>,
            "std_dev": <number or null>,
            "categories": ["cat1", "cat2"] or null,
            "constraints": ["constraint1", "constraint2"]
        }}
    ],
    "relationships": [
        "description of relationship between variables"
    ],
    "group_definitions": {{
        "group_name": "group_description"
    }},
    "notes": ["additional context for data generation"],
    "selected_model": {{
        "slug": "model-slug-from-catalog",
        "reason": "why this model was selected for this experiment"
    }}
}}

CRITICAL — MANDATORY COLUMN NAMING RULES:
1. Look at the selected model's "inputs" section in its model detail.
2. For EVERY required input, you MUST add a column whose "name" is the EXACT \
input field name (e.g. if the model expects "sequence", the column name must be \
literally "sequence" — NOT "protein_sequence", NOT "amino_acid_seq", just "sequence").
3. These model-input columns MUST appear FIRST in the columns array.
4. You may add additional experiment-specific columns from the paper AFTER the \
model-input columns.
5. If you do not include the model's required input columns with their exact \
names, the pipeline will fail. This is the most important rule.

RESEARCH PAPER:
{paper_text}\
"""


class SchemaExtractor:
    """
    Extracts a structured ExperimentSchema from research paper text
    using GPT-5.4.
    """

    def __init__(
        self,
        api_key: str | None = None,
        model: str = "gpt-5.4",
        models_dir: Path | None = None,
    ):
        self.client = OpenAI(api_key=api_key)
        self.model = model
        self._models_dir = models_dir
        self._model_index = load_model_index(models_dir)
        self._model_index_text = format_index_for_prompt(self._model_index, models_dir)

    def extract(self, paper_text: str, run_folder_path: str | None = None) -> ExperimentSchema:
        logger.info(f"Extracting schema using {self.model}")
        logger.info(f"Paper length: {len(paper_text)} characters")

        has_models = bool(self._model_index.get("models"))
        if has_models:
            logger.info(
                f"Including model index ({self._model_index.get('total_models', 0)} models) "
                f"in extraction prompt"
            )

        user_content = self._build_user_content(paper_text, run_folder_path, with_models=has_models)
        system_prompt = EXTRACTION_SYSTEM_PROMPT_WITH_MODELS if has_models else EXTRACTION_SYSTEM_PROMPT

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content},
        ]

        response = self.client.chat.completions.create(
            model=self.model,
            max_completion_tokens=16384,
            messages=messages,
        )

        choice = response.choices[0]
        raw_text = choice.message.content or ""
        finish_reason = choice.finish_reason
        refusal = getattr(choice.message, "refusal", None)

        logger.info(f"Response finish_reason={finish_reason}, length={len(raw_text)}")

        if not raw_text.strip():
            details = (
                f"finish_reason={finish_reason}, "
                f"refusal={refusal}, "
                f"usage={response.usage}, "
                f"model={response.model}"
            )
            raise ValueError(f"Model returned empty response. {details}")

        schema = self._parse_response(raw_text)

        # If a model was selected, load its full model.json and enrich
        if schema.selected_model and schema.selected_model.get("slug"):
            slug = schema.selected_model["slug"]
            full_model = load_model_by_slug(slug, self._models_dir)
            if full_model:
                schema.selected_model["name"] = full_model.get("name", slug)
                schema.selected_model["category"] = full_model.get("category", "")
                schema.selected_model["inputs"] = full_model.get("inputs", {})
                schema.selected_model["api_type"] = full_model.get("api_type", slug)
                schema.selected_model["api_settings_example"] = full_model.get("api_settings_example", {})
                logger.info(f"Enriched selected model: {full_model.get('name')} ({slug})")
            else:
                logger.warning(f"Could not load full model.json for slug: {slug}")

        return schema

    def _build_user_content(
        self, paper_text: str, run_folder_path: str | None, with_models: bool = False
    ) -> str | list[dict]:
        # Truncate paper text to ~50k chars (~12k tokens) to keep prompt reasonable
        max_paper_chars = 50000
        if len(paper_text) > max_paper_chars:
            logger.info(f"Truncating paper text from {len(paper_text)} to {max_paper_chars} chars")
            paper_text = paper_text[:max_paper_chars]

        if with_models:
            base_prompt = EXTRACTION_USER_PROMPT_WITH_MODELS.format(
                paper_text=paper_text,
                model_catalog=self._model_index_text,
            )
        else:
            base_prompt = EXTRACTION_USER_PROMPT.format(paper_text=paper_text)

        if not run_folder_path:
            return base_prompt

        run_dir = Path(run_folder_path)
        if not run_dir.exists():
            return base_prompt

        # Use only the markdown content from the run folder (skip images —
        # they bloat the prompt massively with base64 encoding and the text
        # content from the paper + markdown files is sufficient for schema extraction).
        md_parts: list[str] = []

        for root, _dirs, files in os.walk(run_dir):
            for fname in sorted(files):
                fpath = Path(root) / fname
                if fpath.suffix.lower() == ".md":
                    md_parts.append(
                        f"--- {fpath.name} ---\n{fpath.read_text()}"
                    )

        if not md_parts:
            return base_prompt

        md_text = "\n\n".join(md_parts)
        # Cap markdown context too
        max_md_chars = 30000
        if len(md_text) > max_md_chars:
            logger.info(f"Truncating markdown context from {len(md_text)} to {max_md_chars} chars")
            md_text = md_text[:max_md_chars]

        full_prompt = (
            base_prompt
            + "\n\nADDITIONAL EXPERIMENT CONTEXT FROM RUN FOLDER:\n\n"
            + md_text
        )

        logger.info(
            f"Built prompt: {len(md_parts)} markdown files from run {run_dir.name}, "
            f"total prompt length: {len(full_prompt)} chars"
        )

        return full_prompt

    def _parse_response(self, raw_text: str) -> ExperimentSchema:
        json_str = self._extract_json(raw_text)

        try:
            data = json.loads(json_str)
        except json.JSONDecodeError as e:
            raise ValueError(
                f"Failed to parse JSON from model response: {e}\n"
                f"Raw response:\n{raw_text[:500]}"
            )

        try:
            return ExperimentSchema.model_validate(data)
        except Exception as e:
            raise ValueError(
                f"Model response doesn't match ExperimentSchema: {e}\n"
                f"Parsed data keys: {list(data.keys()) if isinstance(data, dict) else 'not a dict'}"
            )

    def _extract_json(self, text: str) -> str:
        if "```json" in text:
            start = text.index("```json") + 7
            end = text.index("```", start)
            return text[start:end].strip()

        if "```" in text:
            start = text.index("```") + 3
            end = text.index("```", start)
            return text[start:end].strip()

        first_brace = text.find("{")
        last_brace = text.rfind("}")
        if first_brace != -1 and last_brace != -1:
            return text[first_brace : last_brace + 1]

        return text
