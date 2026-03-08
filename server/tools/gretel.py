"""
Gretel AI Integration for Synthetic Molecule Generation

Generates "saboteur" and "decoy" molecules for fact-checking drug discovery claims.
- Saboteurs: Modified versions of the lead compound with key groups removed
- Decoys: Random drug-like molecules for baseline comparison

API Docs: https://docs.gretel.ai/
Python SDK: https://python.docs.gretel.ai/
"""

import os
import json
from typing import Optional
from dataclasses import dataclass, asdict

# Gretel SDK imports (install with: pip install gretel-client)
try:
    from gretel_client.navigator_client import Gretel
    GRETEL_AVAILABLE = True
except ImportError:
    GRETEL_AVAILABLE = False

GRETEL_API_KEY = os.getenv("GRETEL_API_KEY")


@dataclass
class MoleculeGenerationRequest:
    """Request for generating synthetic molecules."""
    lead_smiles: str  # Original drug SMILES
    lead_name: str  # Drug name
    target_protein: str  # Target protein name
    mechanism: str  # Claimed binding mechanism
    num_saboteurs: int = 50  # Number of saboteur variants
    num_decoys: int = 50  # Number of decoy molecules
    saboteur_modifications: list[str] = None  # Specific modifications to make


@dataclass
class GeneratedMolecule:
    """A generated molecule with metadata."""
    smiles: str
    name: str
    type: str  # "lead", "saboteur", or "decoy"
    modification: Optional[str] = None  # What was changed (for saboteurs)


@dataclass
class MoleculeGenerationResult:
    """Result of molecule generation."""
    job_id: str
    molecules: list[GeneratedMolecule]
    lead: GeneratedMolecule
    saboteurs: list[GeneratedMolecule]
    decoys: list[GeneratedMolecule]


async def generate_molecules(request: MoleculeGenerationRequest) -> MoleculeGenerationResult:
    """
    Generate saboteur and decoy molecules using Gretel AI.

    For saboteurs: Uses Gretel's Data Designer to create variants with
    specific functional group modifications based on the claimed mechanism.

    For decoys: Generates random drug-like molecules with similar
    molecular properties (MW, logP) but different structures.
    """

    if not GRETEL_API_KEY:
        # Return mock data for demo
        return _generate_mock_molecules(request)

    if not GRETEL_AVAILABLE:
        raise ImportError("gretel-client not installed. Run: pip install gretel-client")

    # Initialize Gretel client
    gretel = Gretel(api_key=GRETEL_API_KEY)

    # Create a project for this generation job
    project_name = f"biofact-{request.lead_name.lower().replace(' ', '-')}"

    # Build the generation prompt for saboteurs
    saboteur_prompt = f"""Generate {request.num_saboteurs} molecular variants of the drug {request.lead_name}.

Original SMILES: {request.lead_smiles}
Target Protein: {request.target_protein}
Claimed Mechanism: {request.mechanism}

For each variant, make ONE of these modifications that should BREAK the binding mechanism:
{chr(10).join(f'- {mod}' for mod in (request.saboteur_modifications or ['Remove key functional groups', 'Invert stereochemistry', 'Replace hydrogen bond donors/acceptors']))}

Output format: CSV with columns [smiles, name, modification]
Each molecule should be a valid SMILES string.
"""

    # Build the generation prompt for decoys
    decoy_prompt = f"""Generate {request.num_decoys} random drug-like molecules.

Reference molecule: {request.lead_smiles}

Requirements:
- Similar molecular weight (within 20%)
- Similar logP (within 1.0 units)
- Valid drug-like structures (Lipinski's Rule of Five)
- Structurally DIFFERENT from the reference (different scaffold)

Output format: CSV with columns [smiles, name]
Each molecule should be a valid SMILES string.
"""

    try:
        # Use Gretel's Data Designer for generation
        # This uses their LLM-based synthetic data generation

        saboteur_workflow = gretel.workflows.builder() \
            .with_project(project_name) \
            .add_step(gretel.tasks.DataDesigner(
                prompt=saboteur_prompt,
                num_records=request.num_saboteurs
            )) \
            .run()

        saboteur_workflow.wait_until_done()
        saboteur_df = saboteur_workflow.dataset.df

        decoy_workflow = gretel.workflows.builder() \
            .with_project(project_name) \
            .add_step(gretel.tasks.DataDesigner(
                prompt=decoy_prompt,
                num_records=request.num_decoys
            )) \
            .run()

        decoy_workflow.wait_until_done()
        decoy_df = decoy_workflow.dataset.df

        # Parse results
        lead = GeneratedMolecule(
            smiles=request.lead_smiles,
            name=request.lead_name,
            type="lead"
        )

        saboteurs = []
        for _, row in saboteur_df.iterrows():
            saboteurs.append(GeneratedMolecule(
                smiles=row.get('smiles', ''),
                name=row.get('name', f'Saboteur-{len(saboteurs)+1}'),
                type="saboteur",
                modification=row.get('modification', 'Unknown modification')
            ))

        decoys = []
        for _, row in decoy_df.iterrows():
            decoys.append(GeneratedMolecule(
                smiles=row.get('smiles', ''),
                name=row.get('name', f'Decoy-{len(decoys)+1}'),
                type="decoy"
            ))

        all_molecules = [lead] + saboteurs + decoys

        return MoleculeGenerationResult(
            job_id=f"gretel-{saboteur_workflow.id}",
            molecules=all_molecules,
            lead=lead,
            saboteurs=saboteurs,
            decoys=decoys
        )

    except Exception as e:
        print(f"Gretel API error: {e}")
        # Fall back to mock data
        return _generate_mock_molecules(request)


def _generate_mock_molecules(request: MoleculeGenerationRequest) -> MoleculeGenerationResult:
    """Generate mock molecules for demo/testing."""

    import random
    import hashlib

    lead = GeneratedMolecule(
        smiles=request.lead_smiles,
        name=request.lead_name,
        type="lead"
    )

    # Mock saboteur modifications based on common drug chemistry
    modifications = request.saboteur_modifications or [
        "Removed piperazine bicyclic ring",
        "Replaced carboxyl with methyl",
        "Inverted chiral center",
        "Removed hydrogen bond donor",
        "Substituted fluorine with hydrogen",
    ]

    saboteurs = []
    for i in range(request.num_saboteurs):
        mod = modifications[i % len(modifications)]
        # Generate a fake but valid-looking SMILES by modifying the original
        fake_smiles = _mutate_smiles(request.lead_smiles, i)
        saboteurs.append(GeneratedMolecule(
            smiles=fake_smiles,
            name=f"Saboteur-{i+1}",
            type="saboteur",
            modification=mod
        ))

    # Mock decoys - random drug-like SMILES
    decoy_scaffolds = [
        "c1ccc2c(c1)ccc1ccccc12",  # Naphthalene
        "c1ccc(cc1)c1ccccc1",  # Biphenyl
        "C1CCCCC1",  # Cyclohexane
        "c1ccc2[nH]ccc2c1",  # Indole
        "c1ccncc1",  # Pyridine
    ]

    decoys = []
    for i in range(request.num_decoys):
        scaffold = decoy_scaffolds[i % len(decoy_scaffolds)]
        fake_smiles = f"{scaffold}C(=O)N{i % 10}"
        decoys.append(GeneratedMolecule(
            smiles=fake_smiles,
            name=f"Decoy-{i+1}",
            type="decoy"
        ))

    all_molecules = [lead] + saboteurs + decoys

    job_id = hashlib.md5(request.lead_smiles.encode()).hexdigest()[:8]

    return MoleculeGenerationResult(
        job_id=f"gretel-mock-{job_id}",
        molecules=all_molecules,
        lead=lead,
        saboteurs=saboteurs,
        decoys=decoys
    )


def _mutate_smiles(smiles: str, seed: int) -> str:
    """Create a simple mutation of a SMILES string for demo purposes."""
    import random
    random.seed(seed)

    # Simple character substitutions to create variant SMILES
    mutations = [
        ('N', 'C'),
        ('O', 'S'),
        ('F', 'Cl'),
        ('c', 'n'),
        ('C(=O)', 'C'),
    ]

    result = smiles
    mutation = mutations[seed % len(mutations)]
    if mutation[0] in result:
        result = result.replace(mutation[0], mutation[1], 1)

    return result


def molecules_to_csv(result: MoleculeGenerationResult) -> str:
    """Convert generation result to CSV format for downstream tools."""
    lines = ["smiles,name,type,modification"]

    for mol in result.molecules:
        mod = mol.modification or ""
        lines.append(f'"{mol.smiles}","{mol.name}","{mol.type}","{mod}"')

    return "\n".join(lines)


def molecules_to_dict(result: MoleculeGenerationResult) -> dict:
    """Convert generation result to dictionary for JSON serialization."""
    return {
        "job_id": result.job_id,
        "total_molecules": len(result.molecules),
        "lead": asdict(result.lead),
        "saboteurs": [asdict(s) for s in result.saboteurs],
        "decoys": [asdict(d) for d in result.decoys],
    }
