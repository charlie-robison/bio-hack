"use client";

import { useMemo, useState } from "react";
import type { SyntheticMarkerRow } from "./types";

interface ResultsTableProps {
  rows: SyntheticMarkerRow[];
  isLoading: boolean;
}

type StatusFilter = "all" | SyntheticMarkerRow["status"] | "significant";
type SortMode = "p_value" | "effect" | "confidence";

const STATUS_STYLES: Record<SyntheticMarkerRow["status"], string> = {
  Upregulated: "bg-emerald-100 text-emerald-700",
  Downregulated: "bg-rose-100 text-rose-700",
  Stable: "bg-slate-100 text-slate-700",
};

const formatPValue = (value: number) => {
  if (value < 0.001) {
    return value.toExponential(2);
  }

  return value.toFixed(4);
};

export function ResultsTable({ rows, isLoading }: ResultsTableProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("p_value");

  const filteredRows = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    const scopedRows = rows.filter((row) => {
      const matchesQuery =
        !normalizedQuery ||
        row.marker.toLowerCase().includes(normalizedQuery) ||
        row.pathway.toLowerCase().includes(normalizedQuery);

      const matchesStatus =
        statusFilter === "all"
          ? true
          : statusFilter === "significant"
            ? row.pValue < 0.05
            : row.status === statusFilter;

      return matchesQuery && matchesStatus;
    });

    return [...scopedRows].sort((a, b) => {
      if (sortMode === "effect") {
        return Math.abs(b.log2FoldChange) - Math.abs(a.log2FoldChange);
      }

      if (sortMode === "confidence") {
        return b.confidence - a.confidence;
      }

      return a.pValue - b.pValue;
    });
  }, [rows, searchQuery, statusFilter, sortMode]);

  return (
    <section className="panel-card p-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Marker outputs</p>
          <h3 className="mt-1 text-xl font-semibold text-slate-900">Synthetic assay table</h3>
        </div>
        <p className="text-xs text-slate-500">Includes synthetic effect size and significance fields for endpoint parity.</p>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_170px]">
        <label className="block">
          <span className="sr-only">Search marker or pathway</span>
          <input
            type="search"
            value={searchQuery}
            disabled={isLoading}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search marker or pathway"
            className="focus-ring w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-400"
          />
        </label>

        <label className="block">
          <span className="sr-only">Filter by status</span>
          <select
            value={statusFilter}
            disabled={isLoading}
            onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
            className="focus-ring w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800"
          >
            <option value="all">All statuses</option>
            <option value="significant">Significant only</option>
            <option value="Upregulated">Upregulated</option>
            <option value="Downregulated">Downregulated</option>
            <option value="Stable">Stable</option>
          </select>
        </label>

        <label className="block">
          <span className="sr-only">Sort table</span>
          <select
            value={sortMode}
            disabled={isLoading}
            onChange={(event) => setSortMode(event.target.value as SortMode)}
            className="focus-ring w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800"
          >
            <option value="p_value">Sort: p-value</option>
            <option value="effect">Sort: effect size</option>
            <option value="confidence">Sort: confidence</option>
          </select>
        </label>
      </div>

      <p className="mt-3 text-xs text-slate-500">
        {isLoading ? "Updating synthetic rows..." : `${filteredRows.length} of ${rows.length || 0} rows shown`}
      </p>

      <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <caption className="sr-only">Synthetic marker results table</caption>
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.1em] text-slate-600">
            <tr>
              <th className="px-4 py-3 font-semibold">Marker</th>
              <th className="px-4 py-3 font-semibold">Pathway</th>
              <th className="px-4 py-3 font-semibold">Baseline</th>
              <th className="px-4 py-3 font-semibold">Treated</th>
              <th className="px-4 py-3 font-semibold">Fold change</th>
              <th className="px-4 py-3 font-semibold">log2 FC</th>
              <th className="px-4 py-3 font-semibold">p-value</th>
              <th className="px-4 py-3 font-semibold">Confidence</th>
              <th className="px-4 py-3 font-semibold">Samples</th>
              <th className="px-4 py-3 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? (
              Array.from({ length: 6 }).map((_, index) => (
                <tr key={`loading-row-${index}`} className="animate-pulse">
                  {Array.from({ length: 10 }).map((__, cellIndex) => (
                    <td key={`loading-cell-${cellIndex}`} className="px-4 py-3">
                      <span className="block h-4 rounded bg-slate-200" />
                    </td>
                  ))}
                </tr>
              ))
            ) : filteredRows.length ? (
              filteredRows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50/80">
                  <td className="px-4 py-3 font-semibold text-slate-900">{row.marker}</td>
                  <td className="px-4 py-3 text-slate-600">{row.pathway}</td>
                  <td className="px-4 py-3 text-slate-700">{row.baseline}</td>
                  <td className="px-4 py-3 text-slate-700">{row.treated}</td>
                  <td className="px-4 py-3 font-semibold text-slate-900">{row.foldChange.toFixed(2)}x</td>
                  <td
                    className={`px-4 py-3 font-semibold ${
                      row.log2FoldChange > 0
                        ? "text-emerald-700"
                        : row.log2FoldChange < 0
                          ? "text-rose-700"
                          : "text-slate-700"
                    }`}
                  >
                    {row.log2FoldChange.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-700">{formatPValue(row.pValue)}</td>
                  <td className="px-4 py-3 text-slate-700">{row.confidence.toFixed(1)}%</td>
                  <td className="px-4 py-3 text-slate-700">{row.sampleSize}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLES[row.status]}`}>
                      {row.status}
                    </span>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={10} className="px-4 py-12 text-center text-sm text-slate-500">
                  {rows.length
                    ? "No rows match the current filters."
                    : "Upload a research paper and generate synthetic data to view table results."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
