"""
Data Generator (Step 2)
=======================

Uses GPT-4.1-mini to generate synthetic data rows in bulk from
an ExperimentSchema. Fast and cheap for high-volume structured output.
"""

from __future__ import annotations
import json
import logging
import math
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from openai import OpenAI
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

{model_instructions}

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
    Generates synthetic data rows in bulk using GPT-5.2.
    """

    def __init__(
        self,
        api_key: str | None = None,
        model: str = "gpt-5.2",
        batch_size: int = 50,
        max_concurrent: int = 10,
    ):
        self.client = OpenAI(api_key=api_key)
        self.model = model
        self.batch_size = batch_size
        self.max_concurrent = max_concurrent

    def generate(
        self,
        schema: ExperimentSchema,
        num_rows: int = 100,
    ) -> GenerationResult:
        logger.info(
            f"Generating {num_rows} rows using {self.model} "
            f"(batch_size={self.batch_size})"
        )

        num_batches = math.ceil(num_rows / self.batch_size)
        all_rows: list[SyntheticRow] = []

        batches = []
        for i in range(num_batches):
            start_index = i * self.batch_size
            actual_batch_size = min(self.batch_size, num_rows - start_index)
            batches.append((i, actual_batch_size, start_index))

        def _run_batch(spec):
            idx, bs, si = spec
            logger.info(f"Generating batch {idx + 1}/{num_batches}")
            return idx, self._generate_batch(schema, bs, si)

        with ThreadPoolExecutor(max_workers=self.max_concurrent) as executor:
            futures = {executor.submit(_run_batch, b): b for b in batches}
            results = {}
            for future in as_completed(futures):
                batch_spec = futures[future]
                try:
                    idx, rows = future.result()
                    results[idx] = rows
                except Exception as e:
                    logger.error(f"Batch {batch_spec[0] + 1} failed: {e}")

        for i in range(num_batches):
            if i in results:
                all_rows.extend(results[i])

        logger.info(f"Generated {len(all_rows)}/{num_rows} rows successfully")

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

    def _generate_batch(
        self,
        schema: ExperimentSchema,
        batch_size: int,
        start_index: int,
    ) -> list[SyntheticRow]:
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

        model_instructions = self._format_model_instructions(schema)

        prompt = GENERATION_USER_PROMPT.format(
            batch_size=batch_size,
            experiment_summary=schema.experiment_summary,
            columns_description=columns_desc,
            relationships=relationships,
            group_instructions=group_instructions,
            model_instructions=model_instructions,
            start_index=start_index,
        )

        response = self.client.chat.completions.create(
            model=self.model,
            max_completion_tokens=8192,
            messages=[
                {"role": "system", "content": GENERATION_SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
        )

        raw_text = response.choices[0].message.content
        return self._parse_batch_response(raw_text, start_index, batch_size)

    def _format_columns(self, columns: list[DataColumn]) -> str:
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

    def _format_model_instructions(self, schema: ExperimentSchema) -> str:
        if not schema.selected_model:
            return ""

        model = schema.selected_model
        lines = [
            f"TARGET MODEL: {model.get('name', 'Unknown')} ({model.get('slug', '')})",
            f"Each generated row MUST be valid input for this model.",
        ]

        inputs = model.get("inputs", {})
        if inputs:
            lines.append("Required model input fields and their formats:")
            for input_name, input_spec in inputs.items():
                fmt = input_spec.get("format", input_spec.get("type", "unknown"))
                desc = input_spec.get("description", "")
                required = input_spec.get("required", False)
                req_str = " (REQUIRED)" if required else " (optional)"
                lines.append(f"  - {input_name}: format={fmt}{req_str} — {desc}")

        lines.append(
            "Ensure the 'data' object in each row contains these fields "
            "with realistic, properly formatted values."
        )
        return "\n".join(lines)

    def _parse_batch_response(
        self,
        raw_text: str,
        start_index: int,
        expected_count: int,
    ) -> list[SyntheticRow]:
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
        fence_match = re.search(r"```(?:json)?\s*\n?(.*?)```", text, re.DOTALL)
        if fence_match:
            return fence_match.group(1).strip()

        first_bracket = text.find("[")
        last_bracket = text.rfind("]")
        if first_bracket != -1 and last_bracket != -1:
            return text[first_bracket : last_bracket + 1]

        return text
