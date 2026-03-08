"""
Data Generator (Step 2)
=======================

Uses Claude Sonnet 4.6 to generate synthetic data rows in bulk from
an ExperimentSchema. This is the high-volume workhorse of the pipeline.

Why Sonnet? This step requires:
    - Reliable structured JSON output on every call
    - Fast inference (hundreds/thousands of calls)
    - Precise adherence to prompt templates
    - Good enough reasoning to maintain realistic correlations

The generator works by batching rows (e.g., 10-25 per API call) to
balance throughput with output quality. Each batch includes the full
schema context so the model maintains coherent variable relationships.
"""

from __future__ import annotations
import asyncio
import json
import logging
import math
from anthropic import Anthropic
from synthetic_data_gen.models import (
    DataColumn,
    ExperimentSchema,
    GenerationResult,
    SyntheticRow,
)

logger = logging.getLogger(__name__)

GENERATION_SYSTEM_PROMPT = """\
You are a precise synthetic data generator. Given an experiment schema, \
you generate realistic synthetic data rows that:

1. Respect the statistical distributions specified for each variable
2. Maintain realistic correlations between related variables
3. Stay within specified min/max bounds
4. Use the correct categories for categorical variables
5. Satisfy all listed constraints
6. Produce variation — do NOT generate identical or near-identical rows

You MUST return valid JSON only. No explanations, no markdown, just a JSON array.\
"""

GENERATION_USER_PROMPT = """\
Generate exactly {batch_size} synthetic data rows for this experiment.

EXPERIMENT: {experiment_summary}

COLUMNS TO GENERATE:
{columns_description}

VARIABLE RELATIONSHIPS TO MAINTAIN:
{relationships}

{group_instructions}

IMPORTANT CONSTRAINTS:
- Each row must be unique and realistic
- Numeric values should follow the specified distributions
- Maintain correlations between related variables
- Row indices should start at {start_index}

Return a JSON array of objects. Each object must have:
- "row_index": integer starting at {start_index}
- "data": object with keys matching column names exactly
- "group": string group name or null
- "metadata": empty object {{}}

Return ONLY the JSON array, no other text.\
"""


class DataGenerator:
    """
    Generates synthetic data rows in bulk using Claude Sonnet 4.6.

    Takes an ExperimentSchema (output from Step 1) and generates
    the requested number of rows by making batched API calls.
    Rows are generated in configurable batch sizes to balance
    throughput with quality.

    Attributes:
        client: Anthropic API client.
        model: Model ID to use (defaults to Claude Sonnet 4.6).
        batch_size: Number of rows to generate per API call.
        max_concurrent: Maximum concurrent API calls.

    Example:
        generator = DataGenerator(api_key="sk-ant-...")
        result = generator.generate(schema, num_rows=500)
    """

    def __init__(
        self,
        api_key: str | None = None,
        model: str = "claude-sonnet-4-5-20250514",
        batch_size: int = 20,
        max_concurrent: int = 5,
    ):
        """
        Initialize the data generator.

        Args:
            api_key: Anthropic API key. If None, reads from
                ANTHROPIC_API_KEY environment variable.
            model: Model ID for generation. Defaults to Claude Sonnet 4.6,
                which offers the best speed/quality ratio for structured output.
            batch_size: Number of rows per API call. Higher = fewer calls
                but longer responses. 20 is a good default.
            max_concurrent: Maximum parallel API calls. Respects rate limits
                while maximizing throughput.
        """
        self.client = Anthropic(api_key=api_key)
        self.model = model
        self.batch_size = batch_size
        self.max_concurrent = max_concurrent

    def generate(
        self,
        schema: ExperimentSchema,
        num_rows: int = 100,
    ) -> GenerationResult:
        """
        Generate synthetic data rows from an experiment schema.

        Splits the requested rows into batches and processes them
        concurrently for maximum throughput.

        Args:
            schema: The experiment schema from Step 1.
            num_rows: Total number of rows to generate.

        Returns:
            GenerationResult containing all generated rows and metadata.
        """
        logger.info(
            f"Generating {num_rows} rows using {self.model} "
            f"(batch_size={self.batch_size})"
        )

        all_rows = asyncio.run(self._generate_async(schema, num_rows))

        return GenerationResult(
            experiment_schema=schema,
            rows=all_rows,
            total_rows=len(all_rows),
            generation_params={
                "model": self.model,
                "batch_size": self.batch_size,
                "requested_rows": num_rows,
            },
        )

    async def _generate_async(
        self,
        schema: ExperimentSchema,
        num_rows: int,
    ) -> list[SyntheticRow]:
        """
        Async orchestrator that manages concurrent batch generation.

        Uses a semaphore to limit concurrency and gathers all batch
        results into a single ordered list.

        Args:
            schema: Experiment schema to generate from.
            num_rows: Total rows to generate.

        Returns:
            Flat list of all generated SyntheticRow objects.
        """
        num_batches = math.ceil(num_rows / self.batch_size)
        semaphore = asyncio.Semaphore(self.max_concurrent)

        async def limited_batch(batch_index: int) -> list[SyntheticRow]:
            async with semaphore:
                start_index = batch_index * self.batch_size
                actual_batch_size = min(
                    self.batch_size, num_rows - start_index
                )
                return await self._generate_batch(
                    schema, actual_batch_size, start_index
                )

        tasks = [limited_batch(i) for i in range(num_batches)]
        batch_results = await asyncio.gather(*tasks, return_exceptions=True)

        all_rows = []
        for i, result in enumerate(batch_results):
            if isinstance(result, Exception):
                logger.error(f"Batch {i} failed: {result}")
                continue
            all_rows.extend(result)

        logger.info(f"Generated {len(all_rows)}/{num_rows} rows successfully")
        return all_rows

    async def _generate_batch(
        self,
        schema: ExperimentSchema,
        batch_size: int,
        start_index: int,
    ) -> list[SyntheticRow]:
        """
        Generate a single batch of synthetic data rows.

        Constructs the prompt from the schema and makes one API call
        to generate batch_size rows.

        Args:
            schema: Experiment schema.
            batch_size: Number of rows in this batch.
            start_index: Starting row index for this batch.

        Returns:
            List of SyntheticRow objects parsed from the model response.
        """
        columns_desc = self._format_columns(schema.columns)
        relationships = "\n".join(
            f"- {r}" for r in schema.relationships
        ) or "- No specific relationships noted"

        group_instructions = ""
        if schema.group_definitions:
            groups = ", ".join(
                f'"{k}" ({v})' for k, v in schema.group_definitions.items()
            )
            group_instructions = (
                f"EXPERIMENTAL GROUPS (distribute rows roughly evenly):\n{groups}"
            )

        prompt = GENERATION_USER_PROMPT.format(
            batch_size=batch_size,
            experiment_summary=schema.experiment_summary,
            columns_description=columns_desc,
            relationships=relationships,
            group_instructions=group_instructions,
            start_index=start_index,
        )

        # Run synchronous API call in thread pool for async compatibility
        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            None,
            lambda: self.client.messages.create(
                model=self.model,
                max_tokens=4096,
                system=GENERATION_SYSTEM_PROMPT,
                messages=[{"role": "user", "content": prompt}],
            ),
        )

        raw_text = response.content[0].text
        return self._parse_batch_response(raw_text, start_index, batch_size)

    def _format_columns(self, columns: list[DataColumn]) -> str:
        """
        Format column definitions into a readable prompt section.

        Args:
            columns: List of DataColumn definitions.

        Returns:
            Formatted string describing each column for the prompt.
        """
        parts = []
        for col in columns:
            desc = f"- {col.name} ({col.column_type.value}): {col.description}"
            if col.unit:
                desc += f" [{col.unit}]"
            if col.min_value is not None and col.max_value is not None:
                desc += f" range=[{col.min_value}, {col.max_value}]"
            if col.mean is not None:
                desc += f" mean={col.mean}"
            if col.std_dev is not None:
                desc += f" std={col.std_dev}"
            if col.distribution:
                desc += f" dist={col.distribution.value}"
            if col.categories:
                desc += f" categories={col.categories}"
            if col.constraints:
                desc += f" constraints={col.constraints}"
            parts.append(desc)
        return "\n".join(parts)

    def _parse_batch_response(
        self,
        raw_text: str,
        start_index: int,
        expected_count: int,
    ) -> list[SyntheticRow]:
        """
        Parse model response into a list of SyntheticRow objects.

        Handles JSON extraction from potentially wrapped responses
        and validates each row.

        Args:
            raw_text: Raw model response text.
            start_index: Expected starting row index.
            expected_count: Expected number of rows.

        Returns:
            List of validated SyntheticRow objects.

        Raises:
            ValueError: If the response cannot be parsed as valid JSON.
        """
        json_str = self._extract_json_array(raw_text)

        try:
            data = json.loads(json_str)
        except json.JSONDecodeError as e:
            raise ValueError(
                f"Failed to parse batch response: {e}\n"
                f"Response preview: {raw_text[:300]}"
            )

        if not isinstance(data, list):
            raise ValueError(f"Expected JSON array, got {type(data)}")

        rows = []
        for i, item in enumerate(data):
            row = SyntheticRow(
                row_index=item.get("row_index", start_index + i),
                data=item.get("data", item),
                group=item.get("group"),
                metadata=item.get("metadata", {}),
            )
            rows.append(row)

        return rows

    def _extract_json_array(self, text: str) -> str:
        """
        Extract a JSON array from text that may contain markdown
        or surrounding prose.

        Args:
            text: Raw text potentially containing a JSON array.

        Returns:
            Extracted JSON array string.
        """
        if "```json" in text:
            start = text.index("```json") + 7
            end = text.index("```", start)
            return text[start:end].strip()

        if "```" in text:
            start = text.index("```") + 3
            end = text.index("```", start)
            return text[start:end].strip()

        first_bracket = text.find("[")
        last_bracket = text.rfind("]")
        if first_bracket != -1 and last_bracket != -1:
            return text[first_bracket : last_bracket + 1]

        return text
