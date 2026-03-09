"""
Model Catalog Loader
====================

Loads the tamarin model index and individual model.json files from
the server/models/ directory. Provides a compact catalog for prompt
inclusion and full model detail lookup by slug.
"""

from __future__ import annotations
import json
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

MODELS_DIR = Path(__file__).parent.parent / "models"


def load_model_index(models_dir: Path | None = None) -> dict:
    """
    Load index.json which contains the compact catalog of all models.
    Returns the parsed index dict with categories and model listings.
    """
    root = models_dir or MODELS_DIR
    index_path = root / "index.json"
    if not index_path.exists():
        logger.warning(f"index.json not found at {index_path}")
        return {}

    with open(index_path) as f:
        index = json.load(f)

    logger.info(f"Loaded model index: {index.get('total_models', 0)} models")
    return index


def _model_requires_file_input(slug: str, models_dir: Path | None = None) -> bool:
    """Check if a model has any required input of type 'file'."""
    model = load_model_by_slug(slug, models_dir)
    if not model:
        return False
    for _name, spec in model.get("inputs", {}).items():
        if spec.get("required", False) and spec.get("type") == "file":
            return True
    return False


def format_index_for_prompt(index: dict, models_dir: Path | None = None) -> str:
    """
    Format the model index into a compact string for the extraction prompt.

    Filters out models whose required inputs include file uploads (PDB, SDF, etc.)
    since synthetic tabular data cannot satisfy those.
    """
    if not index:
        return "No models available."

    root = models_dir or MODELS_DIR

    # Build set of slugs that require file inputs
    all_models = index.get("models", [])
    file_dependent = set()
    for m in all_models:
        if _model_requires_file_input(m["slug"], root):
            file_dependent.add(m["slug"])

    logger.info(
        f"Filtered {len(file_dependent)} file-dependent models from catalog "
        f"(out of {len(all_models)} total)"
    )

    # Filter categories and models
    categories = index.get("categories", {})
    filtered_categories = {}
    for category, slugs in categories.items():
        filtered = [s for s in slugs if s not in file_dependent]
        if filtered:
            filtered_categories[category] = filtered

    filtered_models = [m for m in all_models if m["slug"] not in file_dependent]

    total = len(filtered_models)
    lines = [f"Total models: {total}\n"]
    lines.append(
        "NOTE: Only models that accept text/sequence/numeric inputs are listed. "
        "Models requiring file uploads (PDB, SDF) have been excluded.\n"
    )

    for category, slugs in filtered_categories.items():
        lines.append(f"## {category} ({len(slugs)} models)")
        lines.append(", ".join(slugs))
        lines.append("")

    if filtered_models:
        lines.append("## Model details (name -> slug -> category)")
        for m in filtered_models:
            lines.append(f"- {m['name']} | slug: {m['slug']} | category: {m['category']}")

    return "\n".join(lines)


def load_model_by_slug(slug: str, models_dir: Path | None = None) -> dict | None:
    """
    Load the full model.json for a specific model by its slug.

    Searches the index for the model's path, then reads its model.json.
    """
    root = models_dir or MODELS_DIR
    index = load_model_index(root)

    # Find the model entry in the index
    for m in index.get("models", []):
        if m.get("slug") == slug:
            model_path = root / m["path"]
            if model_path.exists():
                with open(model_path) as f:
                    return json.load(f)
            else:
                logger.warning(f"Model file not found: {model_path}")
                return None

    logger.warning(f"Model slug not found in index: {slug}")
    return None
