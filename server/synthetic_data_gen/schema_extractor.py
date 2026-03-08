"""
Schema Extractor (Step 1b)
==========================

Uses GPT-4.1 to analyze a research paper and extract a structured
experiment schema. Identifies variables, infers distributions, and
maps out relationships between variables.
"""

from __future__ import annotations
import base64
import json
import logging
import mimetypes
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
the exact input names and formats the model expects.
- Additional experiment-specific columns from the paper can be included too.
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

CRITICAL: The "columns" array must include columns that directly correspond to \
the selected model's required inputs. For example, if the model expects a \
"sequence" input of format "amino_acid_sequence", one of your columns must be \
named "sequence" with column_type "text" and constraints noting it must be a \
valid amino acid sequence. This ensures every generated row can be fed directly \
into the selected model.

RESEARCH PAPER:
{paper_text}\
"""


class SchemaExtractor:
    """
    Extracts a structured ExperimentSchema from research paper text
    using GPT-4.1.
    """

    def __init__(
        self,
        api_key: str | None = None,
        model: str = "gpt-4.1",
        models_dir: Path | None = None,
    ):
        self.client = OpenAI(api_key=api_key)
        self.model = model
        self._models_dir = models_dir
        self._model_index = load_model_index(models_dir)
        self._model_index_text = format_index_for_prompt(self._model_index)

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
            max_tokens=4096,
            messages=messages,
        )

        raw_text = response.choices[0].message.content
        logger.info(f"Received response: {len(raw_text)} characters")

        schema = self._parse_response(raw_text)

        # If a model was selected, load its full model.json and enrich
        if schema.selected_model and schema.selected_model.get("slug"):
            slug = schema.selected_model["slug"]
            full_model = load_model_by_slug(slug, self._models_dir)
            if full_model:
                schema.selected_model["name"] = full_model.get("name", slug)
                schema.selected_model["category"] = full_model.get("category", "")
                schema.selected_model["inputs"] = full_model.get("inputs", {})
                schema.selected_model["api_type"] = full_model.get("api_type", "")
                logger.info(f"Enriched selected model: {full_model.get('name')} ({slug})")
            else:
                logger.warning(f"Could not load full model.json for slug: {slug}")

        return schema

    IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".webp"}

    def _build_user_content(
        self, paper_text: str, run_folder_path: str | None, with_models: bool = False
    ) -> str | list[dict]:
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

        # Build multi-part content (OpenAI vision format)
        content_blocks: list[dict] = [
            {"type": "text", "text": base_prompt},
        ]

        md_parts: list[str] = []
        image_paths: list[Path] = []

        for root, _dirs, files in os.walk(run_dir):
            for fname in sorted(files):
                fpath = Path(root) / fname
                suffix = fpath.suffix.lower()
                if suffix == ".md":
                    md_parts.append(
                        f"--- {fpath.name} ---\n{fpath.read_text()}"
                    )
                elif suffix in self.IMAGE_EXTENSIONS:
                    image_paths.append(fpath)

        if md_parts:
            run_text = (
                "\n\nADDITIONAL EXPERIMENT CONTEXT FROM RUN FOLDER:\n\n"
                + "\n\n".join(md_parts)
            )
            content_blocks.append({"type": "text", "text": run_text})

        # OpenAI vision format for images
        for img_path in image_paths:
            media_type = mimetypes.guess_type(str(img_path))[0] or "image/png"
            img_data = base64.standard_b64encode(img_path.read_bytes()).decode()
            content_blocks.append({"type": "text", "text": f"[Diagram/Figure: {img_path.name}]"})
            content_blocks.append({
                "type": "image_url",
                "image_url": {
                    "url": f"data:{media_type};base64,{img_data}",
                },
            })

        logger.info(
            f"Built multi-part content: {len(md_parts)} markdown files, "
            f"{len(image_paths)} images from run {run_dir.name}"
        )

        return content_blocks

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
