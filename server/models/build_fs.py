#!/usr/bin/env python3
"""
Parse tamrind_models.txt and build a filesystem of model directories with model.json files.
"""

import json
import os
import re

# Priority-ordered category mapping. More specific tags should appear first.
TAG_TO_CATEGORY = [
    ("Structure Prediction", "structure_prediction"),
    ("Protein Design", "protein_design"),
    ("De Novo Binder Design", "protein_design"),
    ("Inverse Folding", "protein_design"),
    ("Antibody Design", "antibody_design"),
    ("Protein Protein Docking", "protein_protein_docking"),
    ("Protein Ligand Docking", "protein_ligand_docking"),
    ("Binding Affinity", "binding_affinity"),
    ("Molecular Dynamics", "molecular_dynamics"),
    ("Generate Small Molecules", "small_molecule_generation"),
    ("Developability", "developability"),
    ("Thermostability", "thermostability"),
    ("Solubility", "solubility"),
    ("Aggregation", "aggregation"),
    ("Immunogenicity", "immunogenicity"),
    ("Humanization", "immunogenicity"),
    ("Point Mutations", "point_mutations"),
    ("Protein Language Models", "protein_language_models"),
    ("RNA Language Models", "rna_language_models"),
    ("Nucleic Acid", "nucleic_acid"),
    ("Finetuning and Active Learning", "finetuning"),
    ("Experimental Data", "experimental_data"),
    ("CryoEM", "cryoem"),
    ("Utilities", "utilities"),
    ("Small Molecule", "small_molecule"),
    ("Enzyme", "enzyme"),
    ("Peptide", "peptide"),
    ("Antibody", "antibody"),
    ("Rosetta", "rosetta"),
]

# Known tag strings (used to distinguish tags from model names)
KNOWN_TAGS = {t[0] for t in TAG_TO_CATEGORY}
# Also add some that might appear but aren't primary categories
KNOWN_TAGS.update([
    "GROMACS",
])


def make_slug(name: str) -> str:
    """Create a URL-friendly slug from a model name."""
    slug = name.lower()
    # Replace parentheses content: keep the text inside
    slug = slug.replace("(", "-").replace(")", "")
    # Replace spaces and multiple hyphens
    slug = slug.replace(" ", "-")
    # Remove special characters except hyphens and alphanumerics
    slug = re.sub(r"[^a-z0-9\-]", "", slug)
    # Collapse multiple hyphens
    slug = re.sub(r"-+", "-", slug)
    # Strip leading/trailing hyphens
    slug = slug.strip("-")
    return slug


def determine_category(tags: list) -> str:
    """Determine primary category from tags using priority mapping."""
    tag_set = set(tags)
    for tag_name, category in TAG_TO_CATEGORY:
        if tag_name in tag_set:
            return category
    return "other"


def is_tag_line(line: str) -> bool:
    """Check if a line is a known tag."""
    return line.strip() in KNOWN_TAGS


def parse_models(filepath: str) -> list:
    """Parse the tamrind_models.txt file into a list of model dicts."""
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    lines = content.split("\n")
    models = []
    current_model = None

    i = 0
    while i < len(lines):
        line = lines[i].strip()

        if not line:
            # Blank line - could be separator between models or between bullet points
            i += 1
            continue

        if line.startswith("•"):
            # Bullet point - add to current model's descriptions
            if current_model is not None:
                bullet_text = line.lstrip("•").strip()
                current_model["bullets"].append(bullet_text)
            i += 1
            continue

        # Non-bullet, non-blank line
        if is_tag_line(line):
            # It's a tag for the current model
            if current_model is not None:
                current_model["tags"].append(line)
            i += 1
            continue

        # It's a new model name
        # Save previous model if exists
        if current_model is not None:
            models.append(current_model)

        current_model = {
            "name": line,
            "tags": [],
            "bullets": [],
        }
        i += 1

    # Don't forget the last model
    if current_model is not None:
        models.append(current_model)

    return models


def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    input_file = os.path.join(script_dir, "tamrind_models.txt")

    models = parse_models(input_file)
    print(f"Parsed {len(models)} models")

    index_categories = {}
    index_models = []

    for model in models:
        name = model["name"]
        tags = model["tags"]
        bullets = model["bullets"]
        slug = make_slug(name)
        category = determine_category(tags)

        # Create directory
        model_dir = os.path.join(script_dir, category, slug)
        os.makedirs(model_dir, exist_ok=True)

        # Build description (join all bullets into one paragraph)
        description = ". ".join(bullets)
        if description and not description.endswith("."):
            description += "."

        # Build model.json
        model_json = {
            "name": name,
            "slug": slug,
            "category": category,
            "tags": tags,
            "description": description,
            "capabilities": bullets,
            "inputs": {},
            "outputs": {},
        }

        model_json_path = os.path.join(model_dir, "model.json")
        with open(model_json_path, "w", encoding="utf-8") as f:
            json.dump(model_json, f, indent=2, ensure_ascii=False)

        # Track for index
        if category not in index_categories:
            index_categories[category] = []
        index_categories[category].append(slug)

        index_models.append({
            "name": name,
            "slug": slug,
            "category": category,
            "path": f"{category}/{slug}/model.json",
        })

        print(f"  Created: {category}/{slug}/")

    # Write index.json
    index = {
        "total_models": len(models),
        "categories": index_categories,
        "models": index_models,
    }

    index_path = os.path.join(script_dir, "index.json")
    with open(index_path, "w", encoding="utf-8") as f:
        json.dump(index, f, indent=2, ensure_ascii=False)

    print(f"\nCreated index.json with {len(models)} models across {len(index_categories)} categories")
    for cat, slugs in sorted(index_categories.items()):
        print(f"  {cat}: {len(slugs)} models")


if __name__ == "__main__":
    main()
