"""
Synthetic Data Pipeline (Orchestrator)
======================================

The main entry point that ties together all pipeline steps:

    Paper → PaperParser → SchemaExtractor (Opus) → DataGenerator (Sonnet) → CSV/JSON

This module provides a single class, SyntheticDataPipeline, that
orchestrates the full end-to-end workflow with sensible defaults.

Example:
    from synthetic_data_gen import SyntheticDataPipeline

    pipeline = SyntheticDataPipeline()

    # From a URL
    result = pipeline.run_from_url("https://arxiv.org/abs/...", num_rows=500)
    pipeline.export_csv(result, "synthetic_data.csv")

    # From raw text
    result = pipeline.run_from_text(paper_text, num_rows=500)
    pipeline.export_json(result, "synthetic_data.json")
"""

from __future__ import annotations
import csv
import json
import logging
from pathlib import Path
from synthetic_data_gen.paper_parser import PaperParser
from synthetic_data_gen.schema_extractor import SchemaExtractor
from synthetic_data_gen.data_generator import DataGenerator
from synthetic_data_gen.models import ExperimentSchema, GenerationResult

logger = logging.getLogger(__name__)


class SyntheticDataPipeline:
    """
    End-to-end pipeline for generating synthetic experimental data
    from research papers.

    Orchestrates:
        1. Paper parsing (PDF/text → clean text)
        2. Schema extraction (clean text → ExperimentSchema via Opus)
        3. Data generation (ExperimentSchema → synthetic rows via Sonnet)
        4. Export (synthetic rows → CSV or JSON)

    Attributes:
        parser: PaperParser instance for reading papers.
        extractor: SchemaExtractor instance (uses Opus).
        generator: DataGenerator instance (uses Sonnet).

    Example:
        pipeline = SyntheticDataPipeline()
        result = pipeline.run("paper.pdf", num_rows=1000)
        pipeline.export_csv(result, "output.csv")
    """

    def __init__(
        self,
        api_key: str | None = None,
        extractor_model: str = "claude-opus-4-20250514",
        generator_model: str = "claude-sonnet-4-5-20250514",
        batch_size: int = 20,
        max_concurrent: int = 5,
    ):
        """
        Initialize the full pipeline.

        Args:
            api_key: Anthropic API key. If None, reads from
                ANTHROPIC_API_KEY environment variable.
            extractor_model: Model for Step 1 (schema extraction).
                Defaults to Opus for maximum reasoning.
            generator_model: Model for Step 2 (data generation).
                Defaults to Sonnet for speed + precision.
            batch_size: Rows per API call during generation.
            max_concurrent: Max parallel API calls during generation.
        """
        self.parser = PaperParser()
        self.extractor = SchemaExtractor(
            api_key=api_key, model=extractor_model
        )
        self.generator = DataGenerator(
            api_key=api_key,
            model=generator_model,
            batch_size=batch_size,
            max_concurrent=max_concurrent,
        )

    def run_from_url(
        self,
        url: str,
        num_rows: int = 100,
    ) -> GenerationResult:
        """
        Run the full pipeline from a paper URL.

        Fetches the paper from the URL (HTML or PDF), extracts the
        experiment schema with Opus, then generates synthetic data
        with Sonnet.

        Args:
            url: URL to the research paper (HTML page or direct PDF link).
            num_rows: Number of synthetic data rows to generate.

        Returns:
            GenerationResult containing the schema and all generated rows.
        """
        logger.info(f"Starting pipeline from URL: {url} → {num_rows} rows")

        paper_text = self.parser.parse_url(url)
        logger.info(f"Fetched paper: {len(paper_text)} characters")

        schema = self.extractor.extract(paper_text)
        logger.info(
            f"Extracted schema: {schema.title} "
            f"({len(schema.columns)} columns)"
        )

        result = self.generator.generate(schema, num_rows=num_rows)
        logger.info(f"Generated {result.total_rows} rows")

        return result

    def run(
        self,
        paper_path: str,
        num_rows: int = 100,
        run_folder_path: str | None = None,
    ) -> GenerationResult:
        """
        Run the full pipeline: parse paper → extract schema → generate data.

        Args:
            paper_path: Path to the research paper (PDF, TXT, or MD).
            num_rows: Number of synthetic data rows to generate.
            run_folder_path: Optional path to a run folder (fs/runs/{run_id})
                whose contents (e.g. content.md) will be provided as extra
                context to the schema extractor.

        Returns:
            GenerationResult containing the schema and all generated rows.
        """
        logger.info(f"Starting pipeline: {paper_path} → {num_rows} rows")

        # Step 1a: Parse the paper
        paper_text = self.parser.parse(paper_path)
        logger.info(f"Parsed paper: {len(paper_text)} characters")

        # Step 1b: Extract experiment schema (Opus)
        schema = self.extractor.extract(paper_text, run_folder_path=run_folder_path)
        logger.info(
            f"Extracted schema: {schema.title} "
            f"({len(schema.columns)} columns)"
        )

        # Step 2: Generate synthetic data (Sonnet)
        result = self.generator.generate(schema, num_rows=num_rows)
        logger.info(f"Generated {result.total_rows} rows")

        return result

    def run_from_text(
        self,
        paper_text: str,
        num_rows: int = 100,
    ) -> GenerationResult:
        """
        Run the pipeline from raw paper text (skip file parsing).

        Useful when you already have the paper text extracted or
        want to paste content directly.

        Args:
            paper_text: Raw text content of the research paper.
            num_rows: Number of synthetic data rows to generate.

        Returns:
            GenerationResult containing the schema and all generated rows.
        """
        logger.info(f"Starting pipeline from text: {len(paper_text)} chars → {num_rows} rows")

        cleaned = self.parser.parse_from_string(paper_text)
        schema = self.extractor.extract(cleaned)
        logger.info(
            f"Extracted schema: {schema.title} "
            f"({len(schema.columns)} columns)"
        )

        result = self.generator.generate(schema, num_rows=num_rows)
        logger.info(f"Generated {result.total_rows} rows")

        return result

    def run_from_schema(
        self,
        schema: ExperimentSchema,
        num_rows: int = 100,
    ) -> GenerationResult:
        """
        Run only Step 2 from an existing schema (skip paper parsing).

        Useful for re-generating data with a previously extracted
        or manually defined schema.

        Args:
            schema: Pre-built ExperimentSchema.
            num_rows: Number of synthetic data rows to generate.

        Returns:
            GenerationResult with generated rows.
        """
        logger.info(f"Generating from existing schema: {schema.title}")
        return self.generator.generate(schema, num_rows=num_rows)

    @staticmethod
    def export_csv(result: GenerationResult, output_path: str) -> str:
        """
        Export generated data to a CSV file.

        Args:
            result: GenerationResult from a pipeline run.
            output_path: Path for the output CSV file.

        Returns:
            The output file path.
        """
        if not result.rows:
            raise ValueError("No rows to export")

        path = Path(output_path)
        path.parent.mkdir(parents=True, exist_ok=True)

        # Get column names from the schema
        col_names = [col.name for col in result.experiment_schema.columns]
        fieldnames = ["row_index", "group"] + col_names

        with open(path, "w", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()

            for row in result.rows:
                flat_row = {
                    "row_index": row.row_index,
                    "group": row.group or "",
                }
                flat_row.update(row.data)
                writer.writerow(flat_row)

        logger.info(f"Exported {len(result.rows)} rows to {output_path}")
        return str(path)

    @staticmethod
    def export_json(result: GenerationResult, output_path: str) -> str:
        """
        Export generated data to a JSON file.

        Includes both the schema and all rows for full reproducibility.

        Args:
            result: GenerationResult from a pipeline run.
            output_path: Path for the output JSON file.

        Returns:
            The output file path.
        """
        path = Path(output_path)
        path.parent.mkdir(parents=True, exist_ok=True)

        with open(path, "w") as f:
            json.dump(result.model_dump(), f, indent=2, default=str)

        logger.info(f"Exported {len(result.rows)} rows to {output_path}")
        return str(path)

    @staticmethod
    def export_schema(schema: ExperimentSchema, output_path: str) -> str:
        """
        Export just the schema to a JSON file.

        Useful for saving/reusing schemas across multiple generation runs.

        Args:
            schema: ExperimentSchema to export.
            output_path: Path for the output JSON file.

        Returns:
            The output file path.
        """
        path = Path(output_path)
        path.parent.mkdir(parents=True, exist_ok=True)

        with open(path, "w") as f:
            json.dump(schema.model_dump(), f, indent=2)

        logger.info(f"Exported schema to {output_path}")
        return str(path)

    @staticmethod
    def load_schema(schema_path: str) -> ExperimentSchema:
        """
        Load a previously exported schema from JSON.

        Args:
            schema_path: Path to a schema JSON file.

        Returns:
            Loaded ExperimentSchema.
        """
        with open(schema_path) as f:
            data = json.load(f)
        return ExperimentSchema.model_validate(data)
