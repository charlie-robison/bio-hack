"""
Sample Data Loader
==================

Utility for loading AlphaFold sample data (proteins, configs, results)
from the sample_data/ directory.
"""

from __future__ import annotations
import json
from pathlib import Path
from synthetic_data_gen.alphafold_models import ProteinSequence


class SampleDataLoader:
    """Loads and serves sample AlphaFold data from the sample_data/ directory."""

    def __init__(self, base_path: Path | None = None):
        self.base_path = base_path or Path(__file__).parent.parent / "sample_data"

    def _load_json(self, *path_parts: str) -> dict:
        filepath = self.base_path.joinpath(*path_parts)
        with open(filepath) as f:
            return json.load(f)

    def list_proteins(self) -> list[ProteinSequence]:
        """Load all protein files from the proteins/ directory."""
        proteins_dir = self.base_path / "proteins"
        proteins = []
        for json_file in sorted(proteins_dir.glob("*.json")):
            with open(json_file) as f:
                data = json.load(f)
            proteins.append(ProteinSequence(**data))
        return proteins

    def get_protein(self, protein_id: str) -> ProteinSequence | None:
        """Find a protein by its protein_id field."""
        for protein in self.list_proteins():
            if protein.protein_id == protein_id:
                return protein
        return None

    def get_af2_config(self, config_name: str) -> dict:
        """Load an AF2 configuration file by name (without .json extension)."""
        return self._load_json("alphafold_inputs", f"{config_name}.json")

    def get_af3_request(self, request_name: str) -> dict:
        """Load an AF3 request file by name (without .json extension)."""
        return self._load_json("alphafold_inputs", f"{request_name}.json")

    def get_sample_output(self, output_name: str) -> dict:
        """Load a sample output file by name (without .json extension)."""
        return self._load_json("alphafold_outputs", f"{output_name}.json")

    def get_confidence_guide(self) -> dict:
        """Load the confidence metrics reference guide."""
        return self._load_json("alphafold_outputs", "confidence_summary.json")
