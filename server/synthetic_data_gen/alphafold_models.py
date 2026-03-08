"""
AlphaFold Data Models
=====================

Pydantic models for protein sequences, AlphaFold prediction inputs,
and prediction results (both AF2 and AF3 formats).
"""

from __future__ import annotations
from typing import Any, Literal
from pydantic import BaseModel, Field


class ProteinChain(BaseModel):
    """A single chain within a protein structure."""
    chain_id: str
    name: str
    sequence: str
    start_residue: int
    end_residue: int


class KnownStructure(BaseModel):
    """Metadata about experimentally determined structures."""
    experimental_method: str
    best_resolution_angstrom: float
    fold_type: str


class ProteinSequence(BaseModel):
    """Complete protein sequence data with metadata."""
    protein_id: str
    name: str
    organism: str
    gene_name: str | None = None
    uniprot_id: str | None = None
    pdb_ids: list[str] = Field(default_factory=list)
    sequence: str
    sequence_length: int
    chains: list[ProteinChain] = Field(default_factory=list)
    description: str
    molecular_weight_da: float | None = None
    known_structures: KnownStructure | None = None
    tags: list[str] = Field(default_factory=list)
    fasta: str


class AF2ModelParams(BaseModel):
    """AlphaFold 2 model configuration parameters."""
    model_preset: Literal["monomer", "multimer"] = "monomer"
    num_models: int = 5
    num_recycles: int = 3
    use_templates: bool = True
    max_template_date: str = "2024-01-01"
    relax_prediction: bool = True
    use_amber_relaxation: bool = True


class MSAParams(BaseModel):
    """Multiple sequence alignment parameters."""
    msa_mode: str = "mmseqs2"
    num_msa_sequences: int = 512
    max_extra_msa: int = 1024
    databases: list[str] = Field(default_factory=lambda: ["uniref90", "mgnify", "bfd", "uniclust30"])
    pairing_strategy: str | None = None


class HardwareEstimate(BaseModel):
    """Estimated hardware requirements."""
    gpu_memory_gb: int
    estimated_runtime_minutes: int
    recommended_gpu: str


class OutputOptions(BaseModel):
    """Options for what to include in prediction output."""
    save_pdb: bool = True
    save_pae: bool = True
    save_msa: bool = False
    save_confidence_json: bool = True


class AF2InputConfig(BaseModel):
    """AlphaFold 2 prediction input configuration."""
    version: Literal["alphafold2"] = "alphafold2"
    prediction_type: Literal["monomer", "multimer"]
    input: dict[str, Any]
    model_params: AF2ModelParams
    msa_params: MSAParams
    hardware: HardwareEstimate | None = None
    output_options: OutputOptions | None = None


class AF3ProteinChainInput(BaseModel):
    """A protein chain in an AF3 prediction request."""
    sequence: str
    count: int = 1


class AF3SequenceEntry(BaseModel):
    """An entry in the AF3 sequences array."""
    proteinChain: AF3ProteinChainInput


class AF3Request(BaseModel):
    """AlphaFold 3 Server API request body."""
    name: str
    modelSeeds: list[int]
    sequences: list[AF3SequenceEntry]


class AF3InputConfig(BaseModel):
    """AlphaFold 3 prediction input configuration."""
    version: Literal["alphafold3"] = "alphafold3"
    api_target: str = "alphafold_server"
    request: AF3Request
    notes: str | None = None


class StructureSummary(BaseModel):
    """Summary of predicted structure properties."""
    num_residues: int | None = None
    num_chains: int | None = None
    secondary_structure: dict[str, int] | None = None
    radius_of_gyration_angstrom: float | None = None
    num_disulfide_bonds: int | None = None
    interface_contacts: int | None = None
    interface_area_angstrom2: float | None = None


class PAESummary(BaseModel):
    """Summary of Predicted Aligned Error matrix."""
    shape: list[int]
    mean_pae: float
    max_pae: float
    interface_pae_mean: float | None = None
    description: str | None = None


class AF2ModelResult(BaseModel):
    """Result for a single AF2 model prediction."""
    model_index: int
    model_name: str
    ranking_score: float
    ptm_score: float
    iptm_score: float | None = None
    mean_plddt: float
    plddt_per_residue: list[float] = Field(default_factory=list)
    chain_plddt: dict[str, float] | None = None
    pae_matrix_summary: PAESummary | None = None
    pdb_file: str
    structure_summary: StructureSummary | None = None


class PLDDTBands(BaseModel):
    """Distribution of pLDDT scores across confidence bands."""
    very_high_90_100: float
    confident_70_90: float
    low_50_70: float
    very_low_0_50: float


class ConfidenceMetrics(BaseModel):
    """Aggregated confidence metrics for a prediction."""
    plddt_bands: PLDDTBands


class PredictionTimings(BaseModel):
    """Timing breakdown for a prediction run."""
    msa_search_seconds: int
    feature_processing_seconds: int
    model_inference_seconds: int
    relaxation_seconds: int
    total_seconds: int


class AF2PredictionResult(BaseModel):
    """Complete AlphaFold 2 prediction result."""
    version: Literal["alphafold2"] = "alphafold2"
    prediction_type: str
    protein: dict[str, Any]
    models: list[AF2ModelResult]
    confidence_metrics: ConfidenceMetrics
    timings: PredictionTimings


class AF3ChainMetric(BaseModel):
    """Per-chain metrics from an AF3 prediction."""
    chain_id: str
    chain_ptm: float
    mean_plddt: float
    sequence_length: int


class AF3SeedResult(BaseModel):
    """Result for a single AF3 seed prediction."""
    seed: int
    ranking_score: float
    fraction_disordered: float
    has_clash: bool
    chain_metrics: list[AF3ChainMetric]
    global_pae_mean: float
    cif_file: str
    full_data_json: str
    pae_json: str
    confidence_json: str


class AF3PredictionResult(BaseModel):
    """Complete AlphaFold 3 prediction result."""
    version: Literal["alphafold3"] = "alphafold3"
    prediction_type: str
    protein: dict[str, Any]
    seeds: list[int]
    results: list[AF3SeedResult]
