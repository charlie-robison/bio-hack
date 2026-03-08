"use client";

import { useMemo, useState } from "react";
import { createSyntheticDataset } from "./data";
import { MetricsCards } from "./MetricsCards";
import { PipelinePanel } from "./PipelinePanel";
import { ResultsTable } from "./ResultsTable";
import { TrendChart } from "./TrendChart";
import type { SyntheticDataset } from "./types";
import { UploadPanel } from "./UploadPanel";

const formatPaperName = (name: string) =>
  name.replace(/\.[^/.]+$/, "").replace(/[_-]+/g, " ").trim();

export function ResearchDashboard() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dataset, setDataset] = useState<SyntheticDataset | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lastRunAt, setLastRunAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const lastRunLabel = useMemo(() => {
    if (!lastRunAt) {
      return "No runs yet";
    }

    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(lastRunAt);
  }, [lastRunAt]);

  const significantCount = dataset?.rows.filter((row) => row.pValue < 0.05).length ?? 0;

  const onAnalyze = async () => {
    if (!selectedFile) {
      setError("Select a paper before running analysis.");
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      // Replace this timer with your endpoint request once API integration is ready.
      await new Promise((resolve) => setTimeout(resolve, 1550));

      const generated = createSyntheticDataset(formatPaperName(selectedFile.name));
      setDataset(generated);
      setLastRunAt(new Date(generated.generatedAt));
    } catch {
      setError("Unable to generate synthetic output. Try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="relative min-h-screen overflow-hidden pb-10">
      <div className="pointer-events-none absolute -left-32 top-8 h-72 w-72 rounded-full bg-cyan-400/15 blur-3xl" />
      <div className="pointer-events-none absolute -right-20 top-28 h-80 w-80 rounded-full bg-emerald-400/20 blur-3xl" />

      <div className="relative mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-8 grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
          <section className="panel-card reveal-up border border-cyan-100/60 bg-gradient-to-br from-white via-cyan-50/50 to-emerald-50/40 p-5 sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-700">
              BioSynth Workspace
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-900 sm:text-4xl">
              Biology paper intelligence dashboard
            </h1>
            <p className="mt-3 max-w-3xl text-sm text-slate-600 sm:text-base">
              Drop in a research paper and run a mock endpoint workflow. Once loaded,
              synthetic marker data is generated in a structured table and interactive chart view.
            </p>
            <div className="mt-5 flex flex-wrap gap-2 text-xs font-medium">
              <span className="rounded-full bg-sky-100 px-3 py-1.5 text-sky-700">Drop + Analyze</span>
              <span className="rounded-full bg-emerald-100 px-3 py-1.5 text-emerald-700">
                Synthetic Cohort Output
              </span>
              <span className="rounded-full bg-slate-100 px-3 py-1.5 text-slate-700">Table + Graph</span>
            </div>
          </section>

          <section className="panel-card reveal-up reveal-delay-1 p-5 sm:p-6" aria-live="polite">
            <div className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className={`h-3 w-3 rounded-full ${
                  isLoading ? "animate-pulse bg-amber-500" : "bg-emerald-500"
                }`}
              />
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.13em] text-slate-500">
                  System state
                </p>
                <p className="text-sm font-semibold text-slate-800">
                  {isLoading ? "Synthesizing dataset..." : "Ready for upload"}
                </p>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl bg-slate-100 p-3">
                <p className="text-xs uppercase tracking-[0.1em] text-slate-500">Markers</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">{dataset?.rows.length ?? "--"}</p>
              </div>
              <div className="rounded-xl bg-emerald-50 p-3">
                <p className="text-xs uppercase tracking-[0.1em] text-emerald-700">Significant</p>
                <p className="mt-1 text-lg font-semibold text-emerald-800">
                  {dataset ? significantCount : "--"}
                </p>
              </div>
            </div>
          </section>
        </header>

        <section className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
          <div className="reveal-up reveal-delay-2">
            <UploadPanel
              selectedFile={selectedFile}
              isLoading={isLoading}
              hasResults={Boolean(dataset)}
              error={error}
              lastRunLabel={lastRunLabel}
              onFileSelect={(file) => {
                setSelectedFile(file);
                setError(null);
              }}
              onFileClear={() => {
                setSelectedFile(null);
                setError(null);
              }}
              onAnalyze={onAnalyze}
            />
          </div>

          <div className="reveal-up reveal-delay-3 space-y-6">
            <MetricsCards dataset={dataset} isLoading={isLoading} />

            <PipelinePanel
              dataset={dataset}
              isLoading={isLoading}
              selectedFileName={selectedFile?.name ?? null}
            />

            <section className="panel-card p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Active dataset
                  </p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">
                    {dataset?.paperTitle ?? "No paper loaded"}
                  </p>
                </div>
                <div className="rounded-xl bg-slate-100 px-3 py-2 text-xs text-slate-600">
                  {dataset
                    ? `Pipeline ${dataset.pipelineVersion}`
                    : "Waiting for first run"}
                </div>
              </div>
            </section>

            <TrendChart rows={dataset?.rows ?? []} isLoading={isLoading} />
            <ResultsTable rows={dataset?.rows ?? []} isLoading={isLoading} />
          </div>
        </section>
      </div>
    </main>
  );
}
