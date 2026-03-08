"use client";

import { useState, useCallback } from "react";
import { Beaker, FlaskConical, RotateCcw, Clock, CheckCircle2 } from "lucide-react";
import PaperDropZone from "@/components/PaperDropZone";
import DataTable from "@/components/DataTable";
import DataChart from "@/components/DataChart";
import StatsCards from "@/components/StatsCards";
import { generateSyntheticData } from "@/components/generateSyntheticData";
import type { SyntheticDataRow } from "@/components/types";

export default function Home() {
  const [data, setData] = useState<SyntheticDataRow[] | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [paperName, setPaperName] = useState<string>("");
  const [processTime, setProcessTime] = useState<number | null>(null);

  const handleProcess = useCallback(async (name: string) => {
    setIsProcessing(true);
    setPaperName(name);
    setProcessTime(null);

    const start = Date.now();

    // Simulate API call — replace with actual endpoint
    // const formData = new FormData();
    // formData.append("file", file);
    // const res = await fetch("/api/analyze", { method: "POST", body: formData });
    // const result = await res.json();

    await new Promise((resolve) => setTimeout(resolve, 3000));
    const syntheticData = generateSyntheticData(60);
    setData(syntheticData);
    setProcessTime(((Date.now() - start) / 1000));
    setIsProcessing(false);
  }, []);

  const handleFileAccepted = useCallback(
    (file: File) => {
      handleProcess(file.name.replace(/\.pdf$/i, ""));
    },
    [handleProcess]
  );

  const handleUrlSubmit = useCallback(
    (url: string) => {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split("/").filter(Boolean);
      const name = pathParts[pathParts.length - 1] || urlObj.hostname;
      handleProcess(name);
    },
    [handleProcess]
  );

  const handleReset = useCallback(() => {
    setData(null);
    setPaperName("");
    setIsProcessing(false);
    setProcessTime(null);
  }, []);

  const showDashboard = data || isProcessing;

  return (
    <div className="min-h-screen bg-zinc-50 font-sans dark:bg-zinc-950">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-zinc-200 bg-white/80 backdrop-blur-xl dark:border-zinc-800 dark:bg-zinc-950/80">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 shadow-md shadow-emerald-500/20">
              <Beaker className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
                BioHack
              </h1>
              <p className="text-[10px] font-medium uppercase tracking-widest text-zinc-400">
                Synthetic Data Lab
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {showDashboard && (
              <button
                onClick={handleReset}
                disabled={isProcessing}
                className="flex items-center gap-1.5 rounded-lg bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-200 disabled:opacity-40 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700 cursor-pointer"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                New Analysis
              </button>
            )}
            <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Ready
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        {/* Upload Section */}
        {!showDashboard && (
          <div className="mx-auto max-w-2xl">
            <div className="mb-8 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20">
                <FlaskConical className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h2 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
                Generate Synthetic Biology Data
              </h2>
              <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400 max-w-md mx-auto">
                Upload a research paper or paste a URL and we&apos;ll generate
                realistic synthetic datasets based on the methodology and findings.
              </p>
            </div>
            <PaperDropZone
              onFileAccepted={handleFileAccepted}
              onUrlSubmit={handleUrlSubmit}
              isProcessing={false}
            />

            {/* Feature highlights */}
            <div className="mt-8 grid grid-cols-3 gap-4">
              {[
                { label: "CSV & JSON Export", desc: "Download your data" },
                { label: "Confidence Intervals", desc: "95% CI with error bars" },
                { label: "Multiple Charts", desc: "Volcano, bar, & CI plots" },
              ].map((feat) => (
                <div key={feat.label} className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-center dark:border-zinc-800 dark:bg-zinc-950">
                  <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">{feat.label}</p>
                  <p className="mt-0.5 text-[10px] text-zinc-400 dark:text-zinc-500">{feat.desc}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Dashboard */}
        {showDashboard && (
          <div className="space-y-6 animate-in">
            {/* Paper Info Bar */}
            <div className="flex items-center justify-between rounded-2xl border border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-950">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-900/20">
                  {isProcessing ? (
                    <svg className="h-5 w-5 text-emerald-600 dark:text-emerald-400 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  ) : (
                    <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    {paperName}
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    {isProcessing
                      ? "Analyzing paper and generating synthetic data..."
                      : "Synthetic data generated successfully"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {processTime && !isProcessing && (
                  <span className="flex items-center gap-1.5 text-xs text-zinc-400 dark:text-zinc-500">
                    <Clock className="h-3.5 w-3.5" />
                    {processTime.toFixed(1)}s
                  </span>
                )}
                {isProcessing && (
                  <div className="w-40">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                      <div className="h-full animate-progress rounded-full bg-gradient-to-r from-emerald-400 to-teal-400" />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Stats */}
            <StatsCards data={data} loading={isProcessing} />

            {/* Charts */}
            <DataChart data={data} loading={isProcessing} />

            {/* Table */}
            <DataTable data={data} loading={isProcessing} />
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-200 dark:border-zinc-800 mt-12">
        <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between">
          <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
            BioHack Synthetic Data Lab &middot; Data is synthetically generated for research purposes
          </p>
          <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
            v0.0.2
          </p>
        </div>
      </footer>
    </div>
  );
}
