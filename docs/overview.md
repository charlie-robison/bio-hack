# BioFact: Computational Fact-Checker for Drug Discovery Papers

## What We're Building

A pipeline that stress-tests scientific claims in drug discovery papers by generating adversarial molecules and running physics-based simulations to verify binding affinity claims.

**Core Insight**: Treat the paper as a hypothesis. Let physics be the judge.

---

## The Pipeline

### Phase 1: Extraction (The Agent)
An AI agent reads a scientific paper and extracts the "digital fingerprint" of the experiment:
- **Target Protein**: PDB ID (e.g., 7RPZ for KRAS G12D)
- **Drug Molecule**: SMILES string of the compound
- **The Claim**: Reported binding selectivity or affinity values

### Phase 2: Synthetic Stress Test (Gretel AI)
Generate a computational "control group" that the original authors didn't test:

| Type | Purpose |
|------|---------|
| **Saboteur Molecules** | Modified versions of the drug with key functional groups removed. If the paper's mechanism is correct, these should fail. |
| **Decoy Molecules** | Random drug-like molecules that look plausible but shouldn't bind. Baseline for noise. |

**Output**: CSV containing original drug + ~200 synthetic variants

### Phase 3: Simulation (Tamarind Bio / Boltz-2)
Run binding simulations on all molecules against both:
- The mutant protein (target)
- The wild-type protein (control)

**Why Boltz-2**: First AI model to reach FEP (Free Energy Perturbation) accuracy. Returns actual Kd (binding affinity) values, not just docking scores.

### Phase 4: Verdict (The Fact-Check)
Compare simulated binding scores against the paper's claims:

| Scenario | Data Trend | Verdict |
|----------|------------|---------|
| Scientific Truth | Original drug has highest score; saboteurs and decoys fail | ✅ **Verified** |
| Selectivity Fraud | Drug binds wild-type as strongly as mutant | ❌ **False Claim** |
| Logic Failure | Saboteurs (missing key groups) bind better than the lead | ⚠️ **Invalid Mechanism** |

---

## Example: MRTX1133 / KRAS G12D

**Paper**: [Nature Medicine 2022](https://www.nature.com/articles/s41591-022-02007-7)

**Claim**: MRTX1133 binds KRAS G12D mutant with 700x selectivity over wild-type

**Test**:
1. Extract MRTX1133 SMILES and KRAS G12D structure (PDB: 7RPZ)
2. Generate saboteurs by modifying the piperazine bicyclic ring (claimed "secret sauce" for D12 salt-bridge)
3. Simulate all variants against G12D and WT
4. Check if the selectivity claim holds

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 16, React 19, Tailwind CSS 4 |
| Backend | Python (FastAPI) |
| Paper Parsing | Claude API |
| Molecule Generation | Gretel AI API |
| Binding Simulation | Tamarind Bio API (Boltz-2) |

---

## Why This Matters

- **Reproducibility Crisis**: Many drug discovery papers contain cherry-picked data
- **Computational Validation**: Run experiments that would take months in a lab, in minutes
- **Adversarial Testing**: Don't just validate—actively try to break the claim
