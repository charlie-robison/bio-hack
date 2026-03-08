"""
Schema Extractor (Step 1b)
==========================

Uses Claude Opus 4.6 to deeply analyze a research paper and extract
a structured experiment schema. This is the "brains" of Step 1 —
it understands experimental design, identifies variables, infers
distributions, and maps out relationships between variables.

Why Opus? This step requires deep reasoning about:
    - What the experiment is actually testing
    - Which variables are independent vs dependent vs controlled
    - Plausible statistical distributions for each variable
    - Correlations and relationships between variables
    - Experimental group definitions
"""

from __future__ import annotations
import base64
import json
import logging
import mimetypes
import os
from pathlib import Path
from anthropic import Anthropic
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
    using Claude Opus 4.6.

    This is the most critical step — the quality of the extracted schema
    directly determines the quality of the generated synthetic data.
    Opus is used here for its superior reasoning about experimental
    design, statistical distributions, and variable relationships.

    Attributes:
        client: Anthropic API client.
        model: Model ID to use (defaults to Claude Opus 4.6).

    Example:
        extractor = SchemaExtractor(api_key="sk-ant-...")
        schema = await extractor.extract("full text of the paper...")
    """

    def __init__(
        self,
        api_key: str | None = None,
        model: str = "claude-opus-4-20250514",
        models_dir: Path | None = None,
    ):
        """
        Initialize the schema extractor.

        Args:
            api_key: Anthropic API key. If None, reads from
                ANTHROPIC_API_KEY environment variable.
            model: Model ID to use. Defaults to Claude Opus 4.6
                for maximum reasoning capability.
            models_dir: Path to the tamarin models directory.
                If None, uses the default server/models/ directory.
        """
        self.client = Anthropic(api_key=api_key)
        self.model = model
        self._models_dir = models_dir
        self._model_index = load_model_index(models_dir)
        self._model_index_text = format_index_for_prompt(self._model_index)

    def extract(self, paper_text: str, run_folder_path: str | None = None) -> ExperimentSchema:
        """
        Extract an experiment schema from research paper text.

        Sends the full paper to Claude Opus with a detailed system prompt
        instructing it to identify all experimental variables, their
        distributions, relationships, and constraints.

        When a model catalog is available, Opus also selects the best
        matching tamarin model. After selection, the full model.json
        is loaded and merged into the schema's selected_model field.

        Args:
            paper_text: The full text of the research paper.
            run_folder_path: Optional path to a run folder (fs/runs/{run_id})
                whose contents will be included as additional context.

        Returns:
            A validated ExperimentSchema containing all extracted
            experimental design information.

        Raises:
            ValueError: If the model response cannot be parsed into
                a valid ExperimentSchema.
        """
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

        response = self.client.messages.create(
            model=self.model,
            max_tokens=8192,
            system=system_prompt,
            messages=[
                {
                    "role": "user",
                    "content": user_content,
                }
            ],
        )

        raw_text = response.content[0].text
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
        """
        Build the user message content for the extraction call.

        If no run folder is provided, returns a plain text prompt.
        If a run folder exists, returns a multi-part content list that
        includes all markdown files as text and all images as vision
        blocks so the model can inspect diagrams and figures.

        If with_models is True, uses the model-aware prompt template
        that includes the tamarin model catalog.
        """
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

        # Start building multi-part content
        content_blocks: list[dict] = [
            {"type": "text", "text": base_prompt},
        ]

        # Collect markdown files and images from the run folder
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

        # Add markdown context as a single text block
        if md_parts:
            run_text = (
                "\n\nADDITIONAL EXPERIMENT CONTEXT FROM RUN FOLDER:\n\n"
                + "\n\n".join(md_parts)
            )
            content_blocks.append({"type": "text", "text": run_text})

        # Add images as vision blocks
        for img_path in image_paths:
            media_type = mimetypes.guess_type(str(img_path))[0] or "image/png"
            img_data = base64.standard_b64encode(img_path.read_bytes()).decode()
            content_blocks.append({"type": "text", "text": f"[Diagram/Figure: {img_path.name}]"})
            content_blocks.append({
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": media_type,
                    "data": img_data,
                },
            })

        logger.info(
            f"Built multi-part content: {len(md_parts)} markdown files, "
            f"{len(image_paths)} images from run {run_dir.name}"
        )

        return content_blocks

    def _parse_response(self, raw_text: str) -> ExperimentSchema:
        """
        Parse the raw LLM response into a validated ExperimentSchema.

        Handles cases where the model wraps JSON in markdown code blocks
        or includes extra text around the JSON.

        Args:
            raw_text: Raw text response from Claude.

        Returns:
            Validated ExperimentSchema.

        Raises:
            ValueError: If the response doesn't contain valid JSON
                or doesn't match the ExperimentSchema structure.
        """
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
        """
        Extract JSON from text that may contain markdown code blocks
        or surrounding prose.

        Args:
            text: Raw text potentially containing JSON.

        Returns:
            Extracted JSON string.
        """
        # Try to find JSON in markdown code block
        if "```json" in text:
            start = text.index("```json") + 7
            end = text.index("```", start)
            return text[start:end].strip()

        if "```" in text:
            start = text.index("```") + 3
            end = text.index("```", start)
            return text[start:end].strip()

        # Try to find raw JSON object
        first_brace = text.find("{")
        last_brace = text.rfind("}")
        if first_brace != -1 and last_brace != -1:
            return text[first_brace : last_brace + 1]

        return text
