"""
Run GPT-5.4 comparison of KRAS G12D AlphaFold predictions
against the Nature Medicine MRTX1133 paper.
"""
import json
import os
from pathlib import Path
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

# Load paper content
run_dir = Path("fs/runs/e5bdfc28-d583-4219-8037-de1904143413")
paper_md = (run_dir / "content.md").read_text()

# Load KRAS G12D protein data and AF2 prediction
sample_dir = Path("sample_data")
kras_protein = json.loads((sample_dir / "proteins/kras_g12d.json").read_text())
kras_af2 = json.loads((sample_dir / "alphafold_outputs/kras_g12d_af2_result.json").read_text())

prediction_context = json.dumps({
    "protein_input": kras_protein,
    "af2_prediction": kras_af2,
}, indent=2)

# Use first ~20k chars of paper (covers abstract, results, key figures)
paper_excerpt = paper_md[:20000]

prompt = f"""You are a structural biology expert analyzing a Nature Medicine paper about MRTX1133,
a non-covalent inhibitor of KRAS G12D. Compare the paper's structural and biochemical claims
against AlphaFold 2 predictions for KRAS G12D.

RESEARCH PAPER (extracted markdown):
{paper_excerpt}

KRAS G12D PROTEIN DATA & ALPHAFOLD 2 PREDICTION:
{prediction_context}

Analyze the paper's claims about:
1. KRAS G12D protein structure (Switch I, Switch II, P-loop regions)
2. MRTX1133 binding site and mechanism (Switch II pocket)
3. Conformational changes upon drug binding
4. Selectivity for G12D over wild-type KRAS
5. Effects on effector protein interactions (RAF, SOS, PI3K)
6. Any structural metrics mentioned (resolution, B-factors, RMSD)

Return a JSON object with this exact structure:
{{
  "paper_title": "title of the paper",
  "paper_journal": "journal name",
  "proteins_analyzed": ["list of proteins discussed"],
  "paper_claims": [
    {{
      "claim": "specific claim from the paper",
      "category": "structure|binding|selectivity|mechanism|efficacy",
      "evidence_type": "crystallography|biochemical|cellular|in_vivo|computational",
      "paper_section": "where in the paper this claim appears"
    }}
  ],
  "comparisons": [
    {{
      "claim": "the paper claim being evaluated",
      "alphafold_evidence": "what the AF2 prediction shows for this region/feature",
      "agreement": "agrees|partially_agrees|disagrees|not_comparable",
      "confidence": "high|medium|low",
      "explanation": "detailed explanation referencing specific pLDDT values, PAE, structural features from the AF2 prediction"
    }}
  ],
  "overall_assessment": {{
    "summary": "3-4 sentence overall assessment of how well AF2 predictions support the paper's structural claims",
    "prediction_reliability_score": 0.0,
    "structural_agreement": "how well the predicted structure matches experimental observations",
    "key_validated_claims": ["claims strongly supported by AF2"],
    "key_limitations": ["what AF2 cannot validate and why"],
    "binding_site_assessment": "specific assessment of Switch II pocket prediction quality",
    "recommendations": ["suggested follow-up analyses"]
  }}
}}

Return ONLY valid JSON, no markdown fences."""

client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

print("Sending to GPT-5.4 for comparison analysis...")
response = client.chat.completions.create(
    model="gpt-5.4",
    messages=[
        {"role": "system", "content": "You are a structural biology expert specializing in oncology drug targets and protein structure prediction. Always respond with valid JSON only."},
        {"role": "user", "content": prompt},
    ],
    temperature=0.2,
)

raw_text = response.choices[0].message.content.strip()
if raw_text.startswith("```"):
    raw_text = raw_text.split("\n", 1)[1]
    if raw_text.endswith("```"):
        raw_text = raw_text[:-3]

comparison = json.loads(raw_text)

# Save results
output_path = Path("sample_data/alphafold_outputs/kras_g12d_paper_comparison.json")
with open(output_path, "w") as f:
    json.dump(comparison, f, indent=2)

print(f"\nComparison saved to {output_path}")
print(f"\nPaper: {comparison.get('paper_title', 'N/A')}")
print(f"Claims analyzed: {len(comparison.get('paper_claims', []))}")
print(f"Comparisons made: {len(comparison.get('comparisons', []))}")
print(f"\nOverall Assessment:")
print(json.dumps(comparison.get("overall_assessment", {}), indent=2))
