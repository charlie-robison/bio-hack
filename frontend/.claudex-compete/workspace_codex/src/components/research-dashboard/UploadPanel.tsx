"use client";

import { useRef, useState } from "react";

interface UploadPanelProps {
  selectedFile: File | null;
  isLoading: boolean;
  hasResults: boolean;
  error: string | null;
  lastRunLabel: string;
  onFileSelect: (file: File) => void;
  onFileClear: () => void;
  onAnalyze: () => Promise<void>;
}

const ACCEPTED_TYPES = ".pdf,.doc,.docx,.txt";

const formatBytes = (bytes: number) => {
  if (bytes < 1024) {
    return `${bytes} bytes`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatType = (file: File) => {
  if (!file.type) {
    return "Unknown type";
  }

  return file.type.replace("application/", "").replace("text/", "").toUpperCase();
};

export function UploadPanel({
  selectedFile,
  isLoading,
  hasResults,
  error,
  lastRunLabel,
  onFileSelect,
  onFileClear,
  onAnalyze,
}: UploadPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFile = (file: File | null) => {
    if (!file) {
      return;
    }

    onFileSelect(file);
  };

  return (
    <aside className="space-y-6">
      <section className="panel-card p-5 sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">Research Input</p>
        <h2 className="mt-2 text-2xl font-semibold text-slate-900">Paper ingestion</h2>
        <p className="mt-2 text-sm text-slate-600">
          Upload a biology paper to simulate endpoint processing and generate a synthetic marker dataset.
        </p>

        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_TYPES}
          className="sr-only"
          onChange={(event) => handleFile(event.target.files?.[0] ?? null)}
        />

        <div
          role="button"
          tabIndex={0}
          aria-label="Drop a file or browse to upload paper"
          aria-describedby="dropzone-hint"
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setIsDragging(false);
            handleFile(event.dataTransfer.files?.[0] ?? null);
          }}
          className={`focus-ring mt-5 rounded-2xl border border-dashed p-5 text-center transition ${
            isDragging
              ? "border-emerald-500 bg-emerald-50"
              : "border-slate-300 bg-white/70 hover:border-sky-500 hover:bg-sky-50/70"
          }`}
        >
          <svg
            className="mx-auto h-10 w-10 text-sky-700"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.7}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 16V5" />
            <path strokeLinecap="round" strokeLinejoin="round" d="m8.5 8.5 3.5-3.5 3.5 3.5" />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M20 15.2c0 2.1-1.8 3.8-4 3.8H8c-2.2 0-4-1.7-4-3.8 0-2 1.6-3.5 3.7-3.8.7-3 3.2-5.2 6.3-5.2 3.7 0 6.7 3 6.7 6.7 1.4.2 2.3 1.1 2.3 2.3Z"
            />
          </svg>
          <p className="mt-3 text-sm font-medium text-slate-800">Drag and drop paper, or click to browse</p>
          <p id="dropzone-hint" className="mt-1 text-xs text-slate-500">
            PDF, DOCX, DOC, TXT
          </p>
        </div>

        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
          {selectedFile ? (
            <div className="space-y-2">
              <p className="truncate text-sm font-semibold text-slate-800">{selectedFile.name}</p>
              <div className="flex flex-wrap gap-2 text-xs text-slate-600">
                <span className="rounded-full bg-slate-100 px-2.5 py-1">{formatBytes(selectedFile.size)}</span>
                <span className="rounded-full bg-slate-100 px-2.5 py-1">{formatType(selectedFile)}</span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500">No paper selected yet.</p>
          )}
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            disabled={!selectedFile || isLoading}
            onClick={() => void onAnalyze()}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-600 to-sky-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:from-teal-500 hover:to-sky-500 disabled:cursor-not-allowed disabled:from-slate-300 disabled:to-slate-400"
          >
            {isLoading ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/50 border-t-white" />
                Synthesizing...
              </>
            ) : (
              "Generate insights"
            )}
          </button>

          <button
            type="button"
            disabled={!selectedFile || isLoading}
            onClick={onFileClear}
            className="inline-flex w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
          >
            Clear file
          </button>
        </div>

        <div className="mt-4 rounded-xl border border-teal-100 bg-teal-50/60 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-teal-700">Endpoint preview</p>
          <p className="mt-1 font-mono text-xs text-teal-900">POST /api/research/synthetic-analysis</p>
        </div>

        {error ? (
          <p role="alert" className="mt-3 text-sm font-medium text-rose-600">
            {error}
          </p>
        ) : null}
      </section>

      <section className="panel-card p-5 sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Session status</p>
        <dl className="mt-3 space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <dt className="text-slate-500">Last run</dt>
            <dd className="font-medium text-slate-800">{lastRunLabel}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-slate-500">Data status</dt>
            <dd
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                hasResults ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"
              }`}
            >
              {hasResults ? "Synthetic output ready" : "Awaiting run"}
            </dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-slate-500">Pipeline mode</dt>
            <dd className="font-medium text-slate-800">Mock endpoint</dd>
          </div>
        </dl>
      </section>
    </aside>
  );
}
