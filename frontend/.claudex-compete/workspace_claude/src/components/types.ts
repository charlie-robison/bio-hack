export interface SyntheticDataRow {
  sampleId: string;
  gene: string;
  expressionLevel: number;
  pValue: number;
  foldChange: number;
  condition: "Treatment" | "Control";
  stdError: number;
  ciLow: number;
  ciHigh: number;
}
