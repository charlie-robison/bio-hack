"""
Direct RDKit tools for molecule manipulation.
No MCP, just functions.
"""

from rdkit import Chem
from rdkit.Chem import AllChem, Descriptors, rdMolDescriptors, Draw, rdMMPA
from rdkit.Chem.Scaffolds import MurckoScaffold
from rdkit import DataStructs
from dataclasses import dataclass
from typing import Optional
import random


@dataclass
class Molecule:
    smiles: str
    name: str
    mol_type: str  # "lead", "saboteur", "decoy"
    modification: Optional[str] = None
    mol_weight: Optional[float] = None
    logp: Optional[float] = None
    valid: bool = True


def parse_smiles(smiles: str) -> Optional[Chem.Mol]:
    """Parse SMILES string to RDKit mol object."""
    return Chem.MolFromSmiles(smiles)


def is_valid_smiles(smiles: str) -> bool:
    """Check if SMILES is valid."""
    return parse_smiles(smiles) is not None


def get_molecular_properties(smiles: str) -> dict:
    """Calculate molecular properties."""
    mol = parse_smiles(smiles)
    if not mol:
        return {"error": "Invalid SMILES"}

    return {
        "mol_weight": Descriptors.MolWt(mol),
        "logp": Descriptors.MolLogP(mol),
        "hbd": rdMolDescriptors.CalcNumHBD(mol),  # H-bond donors
        "hba": rdMolDescriptors.CalcNumHBA(mol),  # H-bond acceptors
        "tpsa": rdMolDescriptors.CalcTPSA(mol),   # Polar surface area
        "rotatable_bonds": rdMolDescriptors.CalcNumRotatableBonds(mol),
        "num_rings": rdMolDescriptors.CalcNumRings(mol),
        "num_aromatic_rings": rdMolDescriptors.CalcNumAromaticRings(mol),
        "formula": rdMolDescriptors.CalcMolFormula(mol),
    }


def get_scaffold(smiles: str) -> str:
    """Extract Murcko scaffold from molecule."""
    mol = parse_smiles(smiles)
    if not mol:
        return ""

    scaffold = MurckoScaffold.GetScaffoldForMol(mol)
    return Chem.MolToSmiles(scaffold)


def fragment_molecule(smiles: str) -> list[tuple[str, str]]:
    """Fragment molecule using MMPA (Matched Molecular Pair Analysis).
    Returns list of (core, sidechain) SMILES pairs.
    """
    mol = parse_smiles(smiles)
    if not mol:
        return []

    try:
        frags = rdMMPA.FragmentMol(mol)
        results = []
        for core, chains in frags:
            if core and chains:
                results.append((Chem.MolToSmiles(core), Chem.MolToSmiles(chains)))
        return results
    except:
        return []


def generate_saboteurs(lead_smiles: str, num: int = 50, modifications: list[str] = None) -> list[Molecule]:
    """
    Generate saboteur molecules by modifying the lead compound.

    Modifications include:
    - Removing functional groups
    - Swapping atoms (N->C, O->S, etc.)
    - Breaking rings
    - Removing stereocenters
    """
    mol = parse_smiles(lead_smiles)
    if not mol:
        return []

    saboteurs = []
    lead_props = get_molecular_properties(lead_smiles)

    # Strategy 1: Atom substitutions
    substitutions = [
        ("N", "C", "Replace nitrogen with carbon"),
        ("O", "S", "Replace oxygen with sulfur"),
        ("F", "H", "Remove fluorine"),
        ("Cl", "H", "Remove chlorine"),
        ("N", "O", "Replace nitrogen with oxygen"),
    ]

    for old, new, desc in substitutions:
        if old in lead_smiles:
            # Replace first occurrence
            new_smiles = lead_smiles.replace(old, new, 1)
            if is_valid_smiles(new_smiles) and new_smiles != lead_smiles:
                props = get_molecular_properties(new_smiles)
                saboteurs.append(Molecule(
                    smiles=new_smiles,
                    name=f"Saboteur-{len(saboteurs)+1}",
                    mol_type="saboteur",
                    modification=desc,
                    mol_weight=props.get("mol_weight"),
                    logp=props.get("logp"),
                ))

            # Replace all occurrences
            new_smiles_all = lead_smiles.replace(old, new)
            if is_valid_smiles(new_smiles_all) and new_smiles_all != lead_smiles and new_smiles_all != new_smiles:
                props = get_molecular_properties(new_smiles_all)
                saboteurs.append(Molecule(
                    smiles=new_smiles_all,
                    name=f"Saboteur-{len(saboteurs)+1}",
                    mol_type="saboteur",
                    modification=f"{desc} (all)",
                    mol_weight=props.get("mol_weight"),
                    logp=props.get("logp"),
                ))

    # Strategy 2: Remove ring systems (simplify scaffold)
    scaffold = get_scaffold(lead_smiles)
    if scaffold and scaffold != lead_smiles:
        props = get_molecular_properties(scaffold)
        saboteurs.append(Molecule(
            smiles=scaffold,
            name=f"Saboteur-{len(saboteurs)+1}",
            mol_type="saboteur",
            modification="Reduced to scaffold only",
            mol_weight=props.get("mol_weight"),
            logp=props.get("logp"),
        ))

    # Strategy 3: Fragment and use fragments
    fragments = fragment_molecule(lead_smiles)
    for core, chain in fragments[:5]:  # Limit fragments
        if is_valid_smiles(core):
            props = get_molecular_properties(core)
            saboteurs.append(Molecule(
                smiles=core,
                name=f"Saboteur-{len(saboteurs)+1}",
                mol_type="saboteur",
                modification="Fragment core",
                mol_weight=props.get("mol_weight"),
                logp=props.get("logp"),
            ))

    # Strategy 4: Random character mutations for more variants
    chars_to_mutate = ['c', 'n', 'o', 'C', 'N', 'O', '1', '2']
    attempts = 0
    while len(saboteurs) < num and attempts < num * 3:
        attempts += 1
        smiles_list = list(lead_smiles)

        # Random mutation
        if len(smiles_list) > 2:
            idx = random.randint(0, len(smiles_list) - 1)
            original = smiles_list[idx]
            if original in chars_to_mutate:
                # Swap with a different char
                options = [c for c in chars_to_mutate if c != original]
                if options:
                    smiles_list[idx] = random.choice(options)
                    new_smiles = "".join(smiles_list)

                    if is_valid_smiles(new_smiles) and new_smiles != lead_smiles:
                        # Check it's not a duplicate
                        if not any(s.smiles == new_smiles for s in saboteurs):
                            props = get_molecular_properties(new_smiles)
                            saboteurs.append(Molecule(
                                smiles=new_smiles,
                                name=f"Saboteur-{len(saboteurs)+1}",
                                mol_type="saboteur",
                                modification=f"Mutated position {idx}",
                                mol_weight=props.get("mol_weight"),
                                logp=props.get("logp"),
                            ))

    return saboteurs[:num]


def generate_decoys(lead_smiles: str, num: int = 50) -> list[Molecule]:
    """
    Generate decoy molecules with similar properties but different structure.
    Uses random scaffolds with property matching.
    """
    lead_props = get_molecular_properties(lead_smiles)
    if "error" in lead_props:
        return []

    target_mw = lead_props["mol_weight"]
    target_logp = lead_props["logp"]

    # Common drug-like scaffolds
    scaffolds = [
        "c1ccccc1",  # Benzene
        "c1ccncc1",  # Pyridine
        "c1ccc2[nH]ccc2c1",  # Indole
        "c1ccc2ccccc2c1",  # Naphthalene
        "C1CCCCC1",  # Cyclohexane
        "c1ccc(cc1)c1ccccc1",  # Biphenyl
        "c1cnc2ccccc2n1",  # Quinazoline
        "c1ccc2c(c1)cccc2",  # Naphthalene alt
        "C1CCNCC1",  # Piperidine
        "C1CNCCN1",  # Piperazine
        "c1ccc2occc2c1",  # Benzofuran
        "c1ccc2sccc2c1",  # Benzothiophene
    ]

    # Substituents to add
    substituents = [
        "C", "CC", "CCC", "C(C)C",  # Alkyls
        "O", "OC", "OCC",  # Ethers
        "N", "NC", "N(C)C",  # Amines
        "F", "Cl", "Br",  # Halogens
        "C(=O)O", "C(=O)N",  # Carboxyl/amide
        "C(=O)C", "C(=O)",  # Carbonyls
        "S", "SC",  # Thiols
    ]

    decoys = []
    attempts = 0

    while len(decoys) < num and attempts < num * 10:
        attempts += 1

        # Pick random scaffold
        scaffold = random.choice(scaffolds)

        # Add 1-3 random substituents
        num_subs = random.randint(1, 3)
        mol = parse_smiles(scaffold)
        if not mol:
            continue

        smiles = scaffold
        for _ in range(num_subs):
            sub = random.choice(substituents)
            # Try to add substituent (simple concatenation for demo)
            test_smiles = f"{smiles}{sub}"
            if is_valid_smiles(test_smiles):
                smiles = test_smiles

        if not is_valid_smiles(smiles):
            continue

        props = get_molecular_properties(smiles)
        if "error" in props:
            continue

        # Check if properties are within range
        mw_diff = abs(props["mol_weight"] - target_mw) / target_mw
        logp_diff = abs(props["logp"] - target_logp) if target_logp != 0 else abs(props["logp"])

        # Accept if within 50% MW and 2.0 logP units (relaxed for variety)
        if mw_diff < 0.5 and logp_diff < 2.0:
            # Check not duplicate
            if not any(d.smiles == smiles for d in decoys):
                decoys.append(Molecule(
                    smiles=smiles,
                    name=f"Decoy-{len(decoys)+1}",
                    mol_type="decoy",
                    modification=None,
                    mol_weight=props["mol_weight"],
                    logp=props["logp"],
                ))

    return decoys[:num]


def generate_dataset(
    lead_smiles: str,
    lead_name: str,
    num_saboteurs: int = 50,
    num_decoys: int = 50,
) -> dict:
    """
    Generate complete dataset for fact-checking.

    Returns dict with:
    - lead: the original molecule
    - saboteurs: modified variants that should fail binding
    - decoys: random molecules for baseline
    - stats: summary statistics
    """

    lead_props = get_molecular_properties(lead_smiles)
    lead = Molecule(
        smiles=lead_smiles,
        name=lead_name,
        mol_type="lead",
        mol_weight=lead_props.get("mol_weight"),
        logp=lead_props.get("logp"),
    )

    saboteurs = generate_saboteurs(lead_smiles, num_saboteurs)
    decoys = generate_decoys(lead_smiles, num_decoys)

    return {
        "lead": lead,
        "saboteurs": saboteurs,
        "decoys": decoys,
        "stats": {
            "total_molecules": 1 + len(saboteurs) + len(decoys),
            "num_saboteurs": len(saboteurs),
            "num_decoys": len(decoys),
            "lead_mw": lead.mol_weight,
            "lead_logp": lead.logp,
        }
    }


def dataset_to_csv(dataset: dict) -> str:
    """Convert dataset to CSV format."""
    lines = ["smiles,name,type,modification,mol_weight,logp"]

    # Lead
    lead = dataset["lead"]
    lines.append(f'"{lead.smiles}","{lead.name}","lead","",{lead.mol_weight or ""},{ lead.logp or ""}')

    # Saboteurs
    for mol in dataset["saboteurs"]:
        mod = mol.modification or ""
        lines.append(f'"{mol.smiles}","{mol.name}","saboteur","{mod}",{mol.mol_weight or ""},{mol.logp or ""}')

    # Decoys
    for mol in dataset["decoys"]:
        lines.append(f'"{mol.smiles}","{mol.name}","decoy","",{mol.mol_weight or ""},{mol.logp or ""}')

    return "\n".join(lines)


# Quick test
if __name__ == "__main__":
    # Test with a simple molecule (aspirin)
    aspirin = "CC(=O)OC1=CC=CC=C1C(=O)O"

    print("Testing RDKit tools...")
    print(f"SMILES valid: {is_valid_smiles(aspirin)}")
    print(f"Properties: {get_molecular_properties(aspirin)}")
    print(f"Scaffold: {get_scaffold(aspirin)}")

    dataset = generate_dataset(aspirin, "Aspirin", num_saboteurs=5, num_decoys=5)
    print(f"\nGenerated {dataset['stats']['total_molecules']} molecules")
    print(f"Saboteurs: {dataset['stats']['num_saboteurs']}")
    print(f"Decoys: {dataset['stats']['num_decoys']}")
