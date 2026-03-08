export const TIME_POINTS = ["0h", "6h", "12h", "24h", "48h", "72h"] as const;

export type MarkerStatus = "Upregulated" | "Downregulated" | "Stable";

export interface SyntheticMarkerRow {
  id: string;
  marker: string;
  pathway: string;
  baseline: number;
  treated: number;
  foldChange: number;
  log2FoldChange: number;
  pValue: number;
  negLog10PValue: number;
  confidence: number;
  sampleSize: number;
  status: MarkerStatus;
  controlSeries: number[];
  treatedSeries: number[];
}

export interface SyntheticDataset {
  paperTitle: string;
  generatedAt: string;
  pipelineVersion: string;
  rows: SyntheticMarkerRow[];
}
