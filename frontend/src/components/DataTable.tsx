"use client";

import { ArrowUpDown, Download, Search, FileSpreadsheet } from "lucide-react";
import { useState, useMemo, useCallback } from "react";
import type { SyntheticDataRow } from "./types";

interface DataTableProps {
  data: SyntheticDataRow[] | null;
  loading: boolean;
}

function SkeletonRow() {
  return (
    <tr className="animate-pulse">
      <td className="px-6 py-3"><div className="h-4 w-20 rounded bg-zinc-100 dark:bg-zinc-800" /></td>
      <td className="px-6 py-3"><div className="h-5 w-14 rounded-md bg-violet-50 dark:bg-violet-900/20" /></td>
      <td className="px-6 py-3"><div className="h-4 w-16 rounded bg-zinc-100 dark:bg-zinc-800" /></td>
      <td className="px-6 py-3"><div className="h-4 w-18 rounded bg-zinc-100 dark:bg-zinc-800" /></td>
      <td className="px-6 py-3"><div className="h-4 w-14 rounded bg-zinc-100 dark:bg-zinc-800" /></td>
      <td className="px-6 py-3"><div className="h-4 w-16 rounded bg-zinc-100 dark:bg-zinc-800" /></td>
      <td className="px-6 py-3"><div className="h-5 w-20 rounded-full bg-zinc-100 dark:bg-zinc-800" /></td>
    </tr>
  );
}

export default function DataTable({ data, loading }: DataTableProps) {
  const [sortKey, setSortKey] = useState<keyof SyntheticDataRow>("sampleId");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(0);
  const rowsPerPage = 15;

  const headers: { key: keyof SyntheticDataRow; label: string; showCI?: boolean }[] = [
    { key: "sampleId", label: "Sample ID" },
    { key: "gene", label: "Gene" },
    { key: "expressionLevel", label: "Expression" },
    { key: "pValue", label: "p-Value" },
    { key: "foldChange", label: "Fold Change" },
    { key: "stdError", label: "95% CI", showCI: true },
    { key: "condition", label: "Condition" },
  ];

  const handleSort = (key: keyof SyntheticDataRow) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const filtered = useMemo(() => {
    if (!data) return [];
    if (!searchQuery.trim()) return data;
    const q = searchQuery.toLowerCase();
    return data.filter(
      (row) =>
        row.gene.toLowerCase().includes(q) ||
        row.sampleId.toLowerCase().includes(q) ||
        row.condition.toLowerCase().includes(q)
    );
  }, [data, searchQuery]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      const dir = sortDir === "asc" ? 1 : -1;
      if (typeof aVal === "number" && typeof bVal === "number")
        return (aVal - bVal) * dir;
      return String(aVal).localeCompare(String(bVal)) * dir;
    });
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / rowsPerPage));
  const paginatedRows = sorted.slice(page * rowsPerPage, (page + 1) * rowsPerPage);

  const handleExportCSV = useCallback(() => {
    if (!data) return;
    const csvHeaders = ["Sample ID", "Gene", "Expression", "p-Value", "Fold Change", "Std Error", "CI Low", "CI High", "Condition"];
    const csvRows = sorted
      .map((row) => [
        row.sampleId,
        row.gene,
        row.expressionLevel,
        row.pValue,
        row.foldChange,
        row.stdError,
        row.ciLow,
        row.ciHigh,
        row.condition,
      ].join(","))
      .join("\n");
    const blob = new Blob([`${csvHeaders.join(",")}\n${csvRows}`], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "biohack_synthetic_data.csv";
    a.click();
    URL.revokeObjectURL(url);
  }, [data, sorted]);

  const handleExportJSON = useCallback(() => {
    if (!data) return;
    const jsonStr = JSON.stringify(sorted, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "biohack_synthetic_data.json";
    a.click();
    URL.revokeObjectURL(url);
  }, [data, sorted]);

  return (
    <div className="w-full overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-col gap-3 border-b border-zinc-100 px-6 py-4 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-800/80">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Synthetic Data
          </h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {loading ? "Generating rows..." : `${filtered.length} rows${searchQuery ? ` matching "${searchQuery}"` : " generated"}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!loading && data && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setPage(0); }}
                placeholder="Search genes..."
                className="rounded-lg border border-zinc-200 bg-zinc-50 py-1.5 pl-8 pr-3 text-xs text-zinc-900 outline-none transition-colors focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 w-44"
              />
            </div>
          )}

          {/* Export dropdown */}
          <div className="relative group">
            <button
              disabled={loading || !data}
              className="flex items-center gap-1.5 rounded-lg bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-200 disabled:opacity-40 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 cursor-pointer"
            >
              <Download className="h-3.5 w-3.5" />
              Export
            </button>
            <div className="invisible absolute right-0 top-full z-20 mt-1 w-36 rounded-xl border border-zinc-200 bg-white p-1 shadow-lg transition-all group-hover:visible dark:border-zinc-700 dark:bg-zinc-900">
              <button
                onClick={handleExportCSV}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800 cursor-pointer"
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
                Export CSV
              </button>
              <button
                onClick={handleExportJSON}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800 cursor-pointer"
              >
                <Download className="h-3.5 w-3.5" />
                Export JSON
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-100 dark:border-zinc-800/80">
              {headers.map((h) => (
                <th
                  key={h.key}
                  onClick={() => !loading && handleSort(h.key)}
                  className={`whitespace-nowrap px-6 py-3 text-xs font-medium uppercase tracking-wider text-zinc-500 transition-colors dark:text-zinc-400 ${
                    loading ? "" : "cursor-pointer hover:text-zinc-900 dark:hover:text-zinc-200"
                  }`}
                >
                  <span className="flex items-center gap-1">
                    {h.label}
                    {!loading && (
                      <ArrowUpDown
                        className={`h-3 w-3 ${
                          sortKey === h.key
                            ? "text-emerald-500"
                            : "text-zinc-300 dark:text-zinc-600"
                        }`}
                      />
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-50 dark:divide-zinc-800/50">
            {loading
              ? Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
              : paginatedRows.map((row) => (
                  <tr
                    key={row.sampleId}
                    className="transition-colors hover:bg-zinc-50/80 dark:hover:bg-zinc-900/50"
                  >
                    <td className="whitespace-nowrap px-6 py-3 font-mono text-xs text-zinc-600 dark:text-zinc-400">
                      {row.sampleId}
                    </td>
                    <td className="whitespace-nowrap px-6 py-3 font-medium text-zinc-900 dark:text-zinc-100">
                      <span className="rounded bg-violet-50 px-2 py-0.5 text-xs font-semibold text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">
                        {row.gene}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-6 py-3 font-mono text-xs text-zinc-700 dark:text-zinc-300">
                      {row.expressionLevel.toFixed(2)}
                    </td>
                    <td className="whitespace-nowrap px-6 py-3 font-mono text-xs">
                      <span
                        className={
                          row.pValue < 0.05
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-zinc-500 dark:text-zinc-400"
                        }
                      >
                        {row.pValue.toExponential(2)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-6 py-3 font-mono text-xs">
                      <span
                        className={`inline-flex items-center gap-1 ${
                          row.foldChange > 0
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-rose-600 dark:text-rose-400"
                        }`}
                      >
                        {row.foldChange > 0 ? "+" : ""}
                        {row.foldChange.toFixed(2)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-6 py-3 font-mono text-[10px] text-zinc-500 dark:text-zinc-400">
                      <span className="rounded bg-zinc-50 px-1.5 py-0.5 dark:bg-zinc-800/60">
                        [{row.ciLow.toFixed(0)}, {row.ciHigh.toFixed(0)}]
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-6 py-3">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          row.condition === "Treatment"
                            ? "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                            : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                        }`}
                      >
                        {row.condition}
                      </span>
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {!loading && data && totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-zinc-100 px-6 py-3 dark:border-zinc-800/80">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Showing {page * rowsPerPage + 1}–{Math.min((page + 1) * rowsPerPage, sorted.length)} of {sorted.length} rows
          </p>
          <div className="flex gap-1">
            <button
              onClick={() => setPage(0)}
              disabled={page === 0}
              className="rounded-md px-2 py-1 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 disabled:opacity-40 dark:text-zinc-400 dark:hover:bg-zinc-800 cursor-pointer"
            >
              First
            </button>
            <button
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0}
              className="rounded-md px-3 py-1 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 disabled:opacity-40 dark:text-zinc-400 dark:hover:bg-zinc-800 cursor-pointer"
            >
              Previous
            </button>
            <button
              onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
              disabled={page >= totalPages - 1}
              className="rounded-md px-3 py-1 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 disabled:opacity-40 dark:text-zinc-400 dark:hover:bg-zinc-800 cursor-pointer"
            >
              Next
            </button>
            <button
              onClick={() => setPage(totalPages - 1)}
              disabled={page >= totalPages - 1}
              className="rounded-md px-2 py-1 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 disabled:opacity-40 dark:text-zinc-400 dark:hover:bg-zinc-800 cursor-pointer"
            >
              Last
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
