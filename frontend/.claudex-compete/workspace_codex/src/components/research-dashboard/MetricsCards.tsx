import type { SyntheticDataset } from "./types";

interface MetricsCardsProps {
  dataset: SyntheticDataset | null;
  isLoading: boolean;
}

const average = (values: number[]) => {
  if (!values.length) {
    return 0;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
};

export function MetricsCards({ dataset, isLoading }: MetricsCardsProps) {
  const rows = dataset?.rows ?? [];
  const significantCount = rows.filter((row) => row.pValue < 0.05).length;
  const meanConfidence = average(rows.map((row) => row.confidence));
  const strongestEffect = rows.reduce<(typeof rows)[number] | null>(
    (top, row) => {
      if (!top || Math.abs(row.log2FoldChange) > Math.abs(top.log2FoldChange)) {
        return row;
      }

      return top;
    },
    null,
  );

  const cards = [
    {
      label: "Tracked markers",
      value: rows.length || "--",
      caption: "Derived from parsed pathways",
    },
    {
      label: "Significant hits",
      value: rows.length ? significantCount : "--",
      caption: "Markers with p-value < 0.05",
    },
    {
      label: "Mean confidence",
      value: rows.length ? `${meanConfidence.toFixed(1)}%` : "--",
      caption: rows.length
        ? `${(meanConfidence / 20).toFixed(2)} quality index`
        : "Awaiting first synthesis run",
    },
    {
      label: "Top effect marker",
      value: rows.length ? strongestEffect?.marker ?? "--" : "--",
      caption: rows.length
        ? `log2 FC ${strongestEffect?.log2FoldChange.toFixed(2)}`
        : "Largest absolute fold-change signal",
    },
  ];

  return (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <article key={card.label} className="panel-card p-4 sm:p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            {card.label}
          </p>
          <p
            className={`mt-3 text-3xl font-semibold text-slate-900 ${
              isLoading ? "animate-pulse" : ""
            }`}
          >
            {isLoading ? "..." : card.value}
          </p>
          <p className="mt-1 text-sm text-slate-500">{card.caption}</p>
        </article>
      ))}
    </section>
  );
}
