import { TIME_POINTS, type MarkerStatus, type SyntheticDataset } from "./types";

const MARKERS = [
  "IL6",
  "TNF",
  "VEGFA",
  "BRCA1",
  "EGFR",
  "MMP9",
  "STAT3",
  "TP53",
  "CXCL8",
  "CDK2",
];

const PATHWAYS = [
  "Inflammation",
  "Cell cycle",
  "DNA repair",
  "Growth signaling",
  "Immune regulation",
  "Angiogenesis",
];

const SIMULATION_VERSION = "synth-v1.2";

const round = (value: number, precision = 2) =>
  Number(value.toFixed(precision));

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const stringToSeed = (value: string) =>
  value.split("").reduce((seed, char) => {
    return ((seed << 5) - seed + char.charCodeAt(0)) | 0;
  }, 0);

const createRng = (seed: number) => {
  let state = seed >>> 0;

  return () => {
    state += 0x6d2b79f5;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const getStatus = (foldChange: number): MarkerStatus => {
  if (foldChange >= 1.1) {
    return "Upregulated";
  }

  if (foldChange <= 0.9) {
    return "Downregulated";
  }

  return "Stable";
};

export const createSyntheticDataset = (paperName: string): SyntheticDataset => {
  const normalizedTitle = paperName.trim() || "Untitled paper";
  const rng = createRng(stringToSeed(normalizedTitle));

  const rows = MARKERS.map((marker, index) => {
    const baseline = round(28 + rng() * 62, 1);
    const treatmentScale = 0.78 + rng() * 0.72;
    const treated = round(baseline * treatmentScale, 1);
    const foldChange = round(treated / baseline, 2);
    const log2FoldChange = round(Math.log2(foldChange), 2);
    const status = getStatus(foldChange);
    const confidence = round(72 + rng() * 27, 1);
    const sampleSize = Math.round(120 + rng() * 220);
    const pathway = PATHWAYS[Math.floor(rng() * PATHWAYS.length)];
    const confidenceWeight = clamp((confidence - 70) / 30, 0, 1);
    const effectWeight = Math.min(Math.abs(log2FoldChange), 1.8) / 1.8;
    const rawPValue =
      0.15 -
      confidenceWeight * 0.11 -
      effectWeight * 0.09 +
      (rng() - 0.5) * 0.02;
    const pValue = round(clamp(rawPValue, 0.0004, 0.2), 4);
    const negLog10PValue = round(-Math.log10(pValue), 2);

    const controlSlope = (rng() - 0.5) * 4;
    const treatmentSlope = (rng() - 0.5) * 8 + (foldChange - 1) * 17;

    const controlSeries = TIME_POINTS.map((_, pointIndex) => {
      const noise = (rng() - 0.5) * 3.2;
      return round(
        Math.max(6, baseline + pointIndex * controlSlope + noise),
        1,
      );
    });

    const treatedSeries = TIME_POINTS.map((_, pointIndex) => {
      const noise = (rng() - 0.5) * 4.2;
      return round(
        Math.max(6, treated + pointIndex * treatmentSlope + noise),
        1,
      );
    });

    return {
      id: `${marker}-${index + 1}`,
      marker,
      pathway,
      baseline,
      treated,
      foldChange,
      log2FoldChange,
      pValue,
      negLog10PValue,
      confidence,
      sampleSize,
      status,
      controlSeries,
      treatedSeries,
    };
  });

  return {
    paperTitle: normalizedTitle,
    generatedAt: new Date().toISOString(),
    pipelineVersion: SIMULATION_VERSION,
    rows,
  };
};
