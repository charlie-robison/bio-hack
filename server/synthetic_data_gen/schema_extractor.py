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
import json
import logging
from anthropic import Anthropic
from synthetic_data_gen.models import ExperimentSchema

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
    ):
        """
        Initialize the schema extractor.

        Args:
            api_key: Anthropic API key. If None, reads from
                ANTHROPIC_API_KEY environment variable.
            model: Model ID to use. Defaults to Claude Opus 4.6
                for maximum reasoning capability.
        """
        self.client = Anthropic(api_key=api_key)
        self.model = model

    def extract(self, paper_text: str) -> ExperimentSchema:
        """
        Extract an experiment schema from research paper text.

        Sends the full paper to Claude Opus with a detailed system prompt
        instructing it to identify all experimental variables, their
        distributions, relationships, and constraints.

        Args:
            paper_text: The full text of the research paper.

        Returns:
            A validated ExperimentSchema containing all extracted
            experimental design information.

        Raises:
            ValueError: If the model response cannot be parsed into
                a valid ExperimentSchema.
        """
        logger.info(f"Extracting schema using {self.model}")
        logger.info(f"Paper length: {len(paper_text)} characters")

        response = self.client.messages.create(
            model=self.model,
            max_tokens=8192,
            system=EXTRACTION_SYSTEM_PROMPT,
            messages=[
                {
                    "role": "user",
                    "content": EXTRACTION_USER_PROMPT.format(
                        paper_text=paper_text
                    ),
                }
            ],
        )

        raw_text = response.content[0].text
        logger.info(f"Received response: {len(raw_text)} characters")

        return self._parse_response(raw_text)

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
