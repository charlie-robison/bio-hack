"""
Synthetic Data Generation Pipeline
===================================

A two-step pipeline for generating synthetic experimental data from research papers:

    Step 1 (Claude Opus 4.6):  Parse research paper → extract experiment schema
    Step 2 (Claude Sonnet 4.6): Bulk generate synthetic data rows from schema

Usage:
    from synthetic_data_gen import SyntheticDataPipeline

    pipeline = SyntheticDataPipeline()
    schema = await pipeline.parse_paper("path/to/paper.pdf")
    dataset = await pipeline.generate_dataset(schema, num_rows=500)
    pipeline.export_csv(dataset, "output.csv")
"""

from synthetic_data_gen.pipeline import SyntheticDataPipeline
from synthetic_data_gen.paper_parser import PaperParser
from synthetic_data_gen.schema_extractor import SchemaExtractor
from synthetic_data_gen.data_generator import DataGenerator
from synthetic_data_gen.models import ExperimentSchema, DataColumn, SyntheticRow

__all__ = [
    "SyntheticDataPipeline",
    "PaperParser",
    "SchemaExtractor",
    "DataGenerator",
    "ExperimentSchema",
    "DataColumn",
    "SyntheticRow",
]
