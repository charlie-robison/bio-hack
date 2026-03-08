import type { SyntheticDataRow } from "./types";

const GENES = [
  "BRCA1", "TP53", "EGFR", "KRAS", "MYC",
  "PTEN", "RB1", "APC", "VEGFA", "HER2",
  "CDK4", "PIK3CA", "BRAF", "ALK", "NRAS",
  "MDM2", "FGFR1", "JAK2", "BCL2", "STAT3",
  "NOTCH1", "CTNNB1", "FOXP3", "CD274", "IL6",
  "TNF", "MTOR", "AKT1", "SRC", "KIT",
];

function gaussianRandom(mean: number, std: number): number {
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return z * std + mean;
}

export function generateSyntheticData(count: number = 60): SyntheticDataRow[] {
  const rows: SyntheticDataRow[] = [];
  for (let i = 0; i < count; i++) {
    const gene = GENES[Math.floor(Math.random() * GENES.length)];
    const condition: "Treatment" | "Control" =
      Math.random() > 0.5 ? "Treatment" : "Control";
    const expressionLevel = Math.max(10, gaussianRandom(400, 250));
    const pValue = Math.random() < 0.55 ? Math.random() * 0.05 : Math.random();
    const foldChange = gaussianRandom(0, 2.5);

    // Generate realistic standard error and 95% confidence intervals
    const stdError = Math.abs(gaussianRandom(expressionLevel * 0.08, expressionLevel * 0.03));
    const ciLow = expressionLevel - 1.96 * stdError;
    const ciHigh = expressionLevel + 1.96 * stdError;

    rows.push({
      sampleId: `SYN-${String(i + 1).padStart(4, "0")}`,
      gene,
      expressionLevel: Math.round(expressionLevel * 100) / 100,
      pValue,
      foldChange: Math.round(foldChange * 1000) / 1000,
      condition,
      stdError: Math.round(stdError * 100) / 100,
      ciLow: Math.round(Math.max(0, ciLow) * 100) / 100,
      ciHigh: Math.round(ciHigh * 100) / 100,
    });
  }
  return rows;
}
