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


def format_index_for_prompt(index: dict) -> str:
    """
    Format the model index into a compact string for the extraction prompt.

    Uses the categories and model names/descriptions from index.json.
    This is small enough to fit comfortably within token limits.
    """
    if not index:
        return "No models available."

    lines = [f"Total models: {index.get('total_models', 0)}\n"]

    # List categories with their model slugs
    categories = index.get("categories", {})
    for category, slugs in categories.items():
        lines.append(f"## {category} ({len(slugs)} models)")
        lines.append(", ".join(slugs))
        lines.append("")

    # Add model name-to-slug mapping from the models list
    models = index.get("models", [])
    if models:
        lines.append("## Model details (name -> slug -> category)")
        for m in models:
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
