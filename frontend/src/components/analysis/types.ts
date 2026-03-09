// Types for fact-checking analysis pipeline

export interface PaperClaim {
  id: string;
  claim: string;
  claimType: "binding_affinity" | "selectivity" | "ic50" | "kd" | "other";
  reportedValue: string;
  unit: string;
  confidence: number; // Claude's extraction confidence
  sourceSection: string;
}

export interface ExtractedPaper {
  title: string;
  authors: string[];
  doi?: string;
  targetProtein: string;
  targetMutation?: string; // e.g., "G12D"
  leadCompound: {
    name: string;
    smiles: string;
  };
  claims: PaperClaim[];
  extractedAt: string;
}

export interface Molecule {
  id: string;
  smiles: string;
  name: string;
  type: "lead" | "saboteur" | "decoy";
  modification?: string;
  molWeight?: number;
  logP?: number;
}

export interface AlphaFoldResult {
  modelType: string;
  plddt: number[]; // per-residue confidence
  meanPlddt: number;
  maxPae: number;
  pae: number[][]; // predicted aligned error matrix
  templatePdbs: string[];
  pdbPath?: string;
}

export interface BindingPrediction {
  moleculeId: string;
  moleculeName: string;
  moleculeType: "lead" | "saboteur" | "decoy";
  predictedAffinity: number; // in nM or appropriate unit
  confidence: number;
  rank: number;
}

export interface FactCheckVerdict {
  status: "verified" | "suspicious" | "debunked" | "inconclusive";
  score: number; // 0-100
  explanation: string;
  details: {
    claimId: string;
    claimText: string;
    reportedValue: string;
    simulatedValue: string;
    deviation: number; // percentage difference
    passes: boolean;
  }[];
}

export interface AnalysisResult {
  id: string;
  createdAt: string;
  paper: ExtractedPaper;
  molecules: {
    lead: Molecule;
    saboteurs: Molecule[];
    decoys: Molecule[];
  };
  structurePrediction?: AlphaFoldResult;
  bindingPredictions: BindingPrediction[];
  verdict: FactCheckVerdict;
}

// Mock data for development
export const MOCK_ANALYSIS: AnalysisResult = {
  id: "analysis-001",
  createdAt: new Date().toISOString(),
  paper: {
    title: "Discovery of MRTX1133, a Noncovalent, Potent, and Selective KRASG12D Inhibitor",
    authors: ["Wang, X.", "Allen, S.", "Blake, J.F.", "et al."],
    doi: "10.1021/acs.jmedchem.1c02184",
    targetProtein: "KRAS",
    targetMutation: "G12D",
    leadCompound: {
      name: "MRTX1133",
      smiles: "CC1=C(C=C(C=C1)C2=CN=C(N=C2N)NC3=CC(=C(C=C3)OC)OC)C(=O)NC4CCCCC4",
    },
    claims: [
      {
        id: "claim-1",
        claim: "MRTX1133 demonstrates 700-fold selectivity for KRAS G12D over wild-type KRAS",
        claimType: "selectivity",
        reportedValue: "700",
        unit: "fold",
        confidence: 0.95,
        sourceSection: "Abstract",
      },
      {
        id: "claim-2",
        claim: "IC50 of 0.001 µM against KRAS G12D",
        claimType: "ic50",
        reportedValue: "0.001",
        unit: "µM",
        confidence: 0.92,
        sourceSection: "Results - Biochemical Assays",
      },
      {
        id: "claim-3",
        claim: "Kd binding affinity of 0.2 pM",
        claimType: "kd",
        reportedValue: "0.2",
        unit: "pM",
        confidence: 0.88,
        sourceSection: "Results - SPR Analysis",
      },
    ],
    extractedAt: new Date().toISOString(),
  },
  molecules: {
    lead: {
      id: "mol-lead",
      smiles: "CC1=C(C=C(C=C1)C2=CN=C(N=C2N)NC3=CC(=C(C=C3)OC)OC)C(=O)NC4CCCCC4",
      name: "MRTX1133",
      type: "lead",
      molWeight: 449.55,
      logP: 3.2,
    },
    saboteurs: [
      { id: "sab-1", smiles: "CC1=C(C=C(C=C1)C2=CC=C(C=C2C)CC3=CC(=C(C=C3)OC)OC)C(=O)NC4CCCCC4", name: "Saboteur-1", type: "saboteur", modification: "Pyrimidine → Benzene (removes H-bond)", molWeight: 445.52, logP: 4.1 },
      { id: "sab-2", smiles: "CC1=C(C=C(C=C1)C2=CN=C(N=C2)NC3=CC(=C(C=C3)OC)OC)C(=O)NC4CCCCC4", name: "Saboteur-2", type: "saboteur", modification: "Removed amino group", molWeight: 434.53, logP: 3.5 },
      { id: "sab-3", smiles: "C1=C(C=C(C=C1)C2=CN=C(N=C2N)NC3=CC(=C(C=C3)OC)OC)C(=O)NC4CCCCC4", name: "Saboteur-3", type: "saboteur", modification: "Removed methyl group", molWeight: 435.52, logP: 2.9 },
    ],
    decoys: [
      { id: "dec-1", smiles: "c1ccc2c(c1)cccc2NC(=O)C3CCCCC3", name: "Decoy-1", type: "decoy", molWeight: 255.36, logP: 3.8 },
      { id: "dec-2", smiles: "COc1ccc(cc1OC)C(=O)Nc2ccccc2", name: "Decoy-2", type: "decoy", molWeight: 271.31, logP: 2.9 },
      { id: "dec-3", smiles: "c1ccc(cc1)c2cnc(nc2N)Nc3ccccc3", name: "Decoy-3", type: "decoy", molWeight: 263.30, logP: 2.4 },
    ],
  },
  structurePrediction: {
    modelType: "alphafold2_ptm",
    plddt: [82.75, 93.06, 96.19, 97.12, 96.5, 97.12, 95.5, 95.0, 93.56, 93.31, 91.44, 89.44, 88.94, 94.12, 92.81, 93.19, 91.25, 92.75, 95.19, 93.31, 92.06, 94.38, 93.69, 92.19, 88.94, 88.69, 84.25, 81.38, 77.06, 71.25, 70.31, 62.62, 67.44, 66.56, 57.56, 65.88, 68.56, 82.31, 86.56, 91.75, 93.44, 93.81, 96.0, 95.75, 95.88, 95.56, 95.38, 94.5, 94.62, 96.25],
    meanPlddt: 87.4,
    maxPae: 31.1,
    pae: [], // truncated for readability
    templatePdbs: ["6ws2_D", "7tlk_B", "7tlk_A", "1jah_A", "6fa1_E"],
  },
  bindingPredictions: [
    { moleculeId: "mol-lead", moleculeName: "MRTX1133", moleculeType: "lead", predictedAffinity: 0.0012, confidence: 0.94, rank: 1 },
    { moleculeId: "sab-1", moleculeName: "Saboteur-1", moleculeType: "saboteur", predictedAffinity: 850.5, confidence: 0.87, rank: 5 },
    { moleculeId: "sab-2", moleculeName: "Saboteur-2", moleculeType: "saboteur", predictedAffinity: 125.3, confidence: 0.89, rank: 4 },
    { moleculeId: "sab-3", moleculeName: "Saboteur-3", moleculeType: "saboteur", predictedAffinity: 45.2, confidence: 0.91, rank: 3 },
    { moleculeId: "dec-1", moleculeName: "Decoy-1", moleculeType: "decoy", predictedAffinity: 12500.0, confidence: 0.82, rank: 7 },
    { moleculeId: "dec-2", moleculeName: "Decoy-2", moleculeType: "decoy", predictedAffinity: 8900.0, confidence: 0.79, rank: 6 },
    { moleculeId: "dec-3", moleculeName: "Decoy-3", moleculeType: "decoy", predictedAffinity: 15200.0, confidence: 0.81, rank: 8 },
  ],
  verdict: {
    status: "verified",
    score: 87,
    explanation: "The binding simulations support the paper's claims. MRTX1133 shows dramatically stronger predicted binding affinity compared to saboteur molecules, consistent with the reported selectivity. Decoy molecules show expected weak binding.",
    details: [
      { claimId: "claim-1", claimText: "700-fold selectivity for G12D", reportedValue: "700x", simulatedValue: "~600x vs saboteurs", deviation: 14.3, passes: true },
      { claimId: "claim-2", claimText: "IC50 of 0.001 µM", reportedValue: "0.001 µM", simulatedValue: "0.0012 µM", deviation: 20.0, passes: true },
    ],
  },
};
