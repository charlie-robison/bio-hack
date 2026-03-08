"""
Data Models
===========

Pydantic models that define the structure of experiment schemas,
data columns, and synthetic data rows flowing through the pipeline.

These models serve as the contract between Step 1 (paper parsing)
and Step 2 (data generation), ensuring the extracted schema is
well-structured enough to drive reliable synthetic data creation.
"""

from __future__ import annotations
from enum import Enum
from typing import Any
from pydantic import BaseModel, Field, field_validator


class ColumnType(str, Enum):
    """Supported data types for synthetic data columns."""
    NUMERIC = "numeric"
    CATEGORICAL = "categorical"
    TEXT = "text"
    BOOLEAN = "boolean"
    DATETIME = "datetime"


class Distribution(str, Enum):
    """Statistical distributions for numeric column generation."""
    NORMAL = "normal"
    UNIFORM = "uniform"
    LOG_NORMAL = "log_normal"
    POISSON = "poisson"
    BINOMIAL = "binomial"
    EXPONENTIAL = "exponential"
    CUSTOM = "custom"


class DataColumn(BaseModel):
    """
    Schema definition for a single column of synthetic data.

    Extracted by Step 1 (Opus) from the research paper, this tells
    Step 2 (Sonnet) exactly what kind of data to generate for each variable.

    Attributes:
        name: Column/variable name (e.g., "blood_pressure_systolic").
        description: What this variable represents in the experiment.
        column_type: The data type (numeric, categorical, text, boolean, datetime).
        unit: Unit of measurement if applicable (e.g., "mmHg", "mg/dL").
        distribution: Statistical distribution for numeric columns.
        min_value: Minimum plausible value for numeric columns.
        max_value: Maximum plausible value for numeric columns.
        mean: Expected mean for numeric columns.
        std_dev: Expected standard deviation for numeric columns.
        categories: List of valid categories for categorical columns.
        constraints: Additional constraints or validation rules
            (e.g., "must be positive", "correlated with age").
    """
    name: str
    description: str
    column_type: ColumnType
    unit: str | None = None
    distribution: Distribution | None = None
    min_value: float | None = None
    max_value: float | None = None
    mean: float | None = None
    std_dev: float | None = None
    categories: list[str] | None = None

    @field_validator("categories", mode="before")
    @classmethod
    def coerce_categories_to_str(cls, v):
        if isinstance(v, list):
            return [str(item) for item in v]
        return v
    constraints: list[str] = Field(default_factory=list)


class ExperimentSchema(BaseModel):
    """
    Complete schema of an experiment extracted from a research paper.

    This is the output of Step 1 and the input to Step 2. It captures
    everything the data generator needs to produce realistic synthetic
    data that mirrors the paper's experimental design.

    Attributes:
        title: Title of the research paper.
        experiment_summary: Brief description of what the experiment tests.
        hypothesis: The paper's hypothesis or research question.
        methodology: Description of the experimental methodology.
        sample_size: Original sample size from the paper (used as reference).
        independent_variables: Variables manipulated in the experiment.
        dependent_variables: Variables measured as outcomes.
        control_variables: Variables held constant or controlled for.
        columns: Full list of data columns to generate.
        relationships: Known relationships/correlations between variables
            (e.g., "blood_pressure increases with age").
        group_definitions: Experimental group definitions if applicable
            (e.g., {"control": "placebo", "treatment": "drug_x_10mg"}).
        notes: Any additional context the generator should know about.
    """
    title: str
    experiment_summary: str
    hypothesis: str
    methodology: str
    sample_size: int | None = None
    independent_variables: list[str]
    dependent_variables: list[str]
    control_variables: list[str] = Field(default_factory=list)
    columns: list[DataColumn]
    relationships: list[str] = Field(default_factory=list)
    group_definitions: dict[str, str] = Field(default_factory=dict)
    notes: list[str] = Field(default_factory=list)


class SyntheticRow(BaseModel):
    """
    A single row of generated synthetic data.

    Attributes:
        row_index: The index/ID of this row in the dataset.
        data: Dictionary mapping column names to generated values.
        group: Which experimental group this row belongs to (if applicable).
        metadata: Any additional metadata from the generation process.
    """
    row_index: int
    data: dict[str, Any]
    group: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class GenerationResult(BaseModel):
    """
    Complete result of a synthetic data generation run.

    Attributes:
        schema: The experiment schema used for generation.
        rows: All generated synthetic data rows.
        total_rows: Total number of rows generated.
        generation_params: Parameters used during generation.
    """
    experiment_schema: ExperimentSchema
    rows: list[SyntheticRow]
    total_rows: int
    generation_params: dict[str, Any] = Field(default_factory=dict)
