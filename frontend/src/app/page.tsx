"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";

type Status = "idle" | "uploading" | "complete" | "error";

interface RunMetadata {
  run_id: string;
  original_filename: string;
  created_at: string;
  page_count: number;
  extracted_image_count: number;
}

interface UploadResult {
  success: boolean;
  run_id: string;
  metadata: RunMetadata;
  markdown_preview: string;
  error?: string;
}

/* ── Visual Pipeline Step ─────────────────────────────── */

function PipelineStep({
  number,
  title,
  desc,
  active,
  color,
}: {
  number: string;
  title: string;
  desc: string;
  active: boolean;
  color: string;
}) {
  return (
    <div className={`flex items-start gap-3 transition-all duration-500 ${active ? "opacity-100" : "opacity-40"}`}>
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold shrink-0 mt-0.5 transition-all"
        style={{
          backgroundColor: active ? color + "18" : "rgba(39,39,42,0.4)",
          color: active ? color : "#52525b",
          border: `1px solid ${active ? color + "40" : "rgba(63,63,70,0.3)"}`,
          boxShadow: active ? `0 0 20px ${color}15` : "none",
        }}
      >
        {number}
      </div>
      <div>
        <div className={`text-base font-medium ${active ? "text-zinc-100" : "text-zinc-600"}`}>{title}</div>
        <div className={`text-sm mt-0.5 leading-relaxed ${active ? "text-zinc-400" : "text-zinc-700"}`}>{desc}</div>
      </div>
    </div>
  );
}

/* ── Demo Result Card ─────────────────────────────────── */

function DemoResult() {
  const [hovered, setHovered] = useState(false);

  return (
    <Link
      href="/alphafold"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="block glass rounded-xl p-5 transition-all duration-300 hover:border-zinc-600 group"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500" />
          <span className="text-[10px] uppercase tracking-wider text-emerald-500 font-medium">Validated</span>
        </div>
        <span className="text-xs text-zinc-600 group-hover:text-cyan-500 transition-colors">
          View full report &rarr;
        </span>
      </div>

      <h4 className="text-base font-medium text-zinc-200 leading-snug mb-3">
        MRTX1133 as a Selective KRAS G12D Inhibitor
      </h4>

      {/* Mini reliability gauge */}
      <div className="flex items-center gap-4 mb-4">
        <div className="relative w-14 h-14">
          <svg viewBox="0 0 36 36" className="w-14 h-14 -rotate-90">
            <circle cx="18" cy="18" r="15" fill="none" stroke="#27272a" strokeWidth="3" />
            <circle
              cx="18" cy="18" r="15" fill="none" stroke="#22c55e" strokeWidth="3"
              strokeDasharray="87 13" strokeLinecap="round"
              className="transition-all duration-1000"
              style={{ strokeDasharray: hovered ? "87 13" : "0 100" }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-sm font-bold font-mono text-emerald-400">87</span>
          </div>
        </div>
        <div className="flex-1 space-y-1.5">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-zinc-500">6 of 7 claims validated</span>
          </div>
          <div className="flex h-1.5 rounded-full overflow-hidden bg-zinc-800">
            <div className="bg-emerald-500" style={{ width: "71%" }} />
            <div className="bg-amber-500" style={{ width: "14%" }} />
            <div className="bg-zinc-600" style={{ width: "15%" }} />
          </div>
          <div className="flex gap-3 text-[10px] text-zinc-600">
            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />5 validated</span>
            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-500" />1 partial</span>
            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-zinc-600" />1 N/A</span>
          </div>
        </div>
      </div>

      {/* Models used */}
      <div className="flex flex-wrap gap-1.5">
        {["DiffDock", "GNINA", "Vina", "Boltz-2", "OpenMM", "PRODIGY"].map((m) => (
          <span key={m} className="text-[10px] px-2 py-0.5 rounded bg-zinc-800/60 text-zinc-500 border border-zinc-800/60">
            {m}
          </span>
        ))}
      </div>
    </Link>
  );
}

/* ── Main Page ─────────────────────────────────────────── */

export default function Home() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [activeStep, setActiveStep] = useState(0);

  // Animate pipeline steps on load
  useEffect(() => {
    const timers = [
      setTimeout(() => setActiveStep(1), 300),
      setTimeout(() => setActiveStep(2), 600),
      setTimeout(() => setActiveStep(3), 900),
      setTimeout(() => setActiveStep(4), 1200),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const processFile = async (file: File) => {
    if (!file.type.includes("pdf")) {
      setError("Please upload a PDF file");
      return;
    }

    setFileName(file.name);
    setError(null);
    setResult(null);
    setStatus("uploading");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("http://localhost:8080/api/upload", {
        method: "POST",
        body: formData,
      });

      const data: UploadResult = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Upload failed");
      }

      setResult(data);
      setStatus("complete");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  return (
    <div className="min-h-screen relative">
      {/* Background — subtle, clean */}
      <div className="fixed inset-0 bg-dots opacity-30 pointer-events-none" />

      <div className="relative px-8 py-12">
        <div className="max-w-5xl mx-auto">

          {/* ── Top: Tagline ─────────────────────────── */}
          <div className="mb-12 animate-fade-in">
            <h1 className="text-4xl lg:text-5xl font-bold text-white tracking-tight mb-3">
              BioFact
            </h1>
            <p className="text-zinc-400 text-base lg:text-lg max-w-lg leading-relaxed">
              Stress-test drug discovery papers with computational models.
              Upload a PDF and get a multi-model validation report.
            </p>
          </div>

          {/* ── Upload zone (full width) ────────────── */}
          <div className="mb-8 animate-fade-in-up" style={{ animationDelay: "0.05s" }}>
            <div
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              className={`
                relative rounded-xl border-2 border-dashed transition-all duration-300 cursor-pointer
                ${status === "uploading" ? "p-6" : "p-10"}
                ${dragActive
                  ? "border-cyan-500 bg-cyan-500/5 glow-cyan"
                  : "border-zinc-800 hover:border-zinc-600 bg-zinc-900/30 hover:bg-zinc-900/50"
                }
                ${status === "uploading" ? "pointer-events-none" : ""}
              `}
            >
              <input
                type="file"
                accept=".pdf"
                onChange={handleFileInput}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                disabled={status === "uploading"}
              />

              {status === "uploading" ? (
                <div className="flex items-center gap-4 max-w-md mx-auto">
                  <div className="w-10 h-10 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center shrink-0 animate-pulse-glow">
                    <div className="w-4 h-4 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{fileName}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">Extracting content with LlamaParse...</p>
                    <div className="mt-2 h-1 rounded-full overflow-hidden bg-zinc-800">
                      <div className="h-full w-full bg-gradient-to-r from-transparent via-cyan-500 to-transparent animate-shimmer" />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center text-center space-y-3">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${
                    dragActive ? "bg-cyan-500/15 border border-cyan-500/25" : "bg-zinc-800/50 border border-zinc-700/30"
                  }`}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={dragActive ? "#06b6d4" : "#71717a"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                      <path d="M14 2v6h6" />
                      <line x1="12" y1="18" x2="12" y2="12" />
                      <polyline points="9 15 12 12 15 15" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-base font-medium text-zinc-300">Upload a research paper</p>
                    <p className="text-sm text-zinc-600 mt-1">PDF files up to 50 pages</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Error */}
          {status === "error" && error && (
            <div className="animate-fade-in rounded-xl bg-red-500/5 border border-red-500/20 p-4 mb-8">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {/* Success result (full width) */}
          {result && status === "complete" && (
            <div className="animate-fade-in-up mb-8">
              <div className="glass rounded-xl p-6 glow-emerald">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2">
                        <path d="M9 11l3 3L22 4" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-white">Paper processed</h3>
                      <p className="text-xs text-zinc-500 font-mono">{result.metadata.page_count} pages &middot; {result.metadata.extracted_image_count} images</p>
                    </div>
                  </div>
                  <code className="text-xs text-cyan-500/70 bg-cyan-500/5 px-2.5 py-1 rounded font-mono">
                    {result.run_id}
                  </code>
                </div>

                <pre className="text-xs text-zinc-500 whitespace-pre-wrap font-mono bg-zinc-950/50 p-4 rounded-lg overflow-auto max-h-40 border border-zinc-800/30 mb-5">
                  {result.markdown_preview}
                </pre>

                <div className="flex gap-3">
                  <Link
                    href="/experiments"
                    className="flex-1 text-center text-sm py-2.5 rounded-lg bg-cyan-600 text-white hover:bg-cyan-500 transition-colors font-medium"
                  >
                    Run Validation Pipeline
                  </Link>
                  <button
                    onClick={() => { setResult(null); setStatus("idle"); setFileName(null); }}
                    className="text-sm px-4 py-2.5 rounded-lg border border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 transition-colors"
                  >
                    Upload another
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Two-column: Pipeline + Example ──────── */}
          {status !== "complete" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              {/* Pipeline */}
              <div className="animate-fade-in-up glass rounded-xl p-6" style={{ animationDelay: "0.1s" }}>
                <div className="text-xs uppercase tracking-[0.15em] text-zinc-500 mb-5">How it works</div>
                <div className="relative">
                  <div className="absolute left-[16px] top-0 bottom-0 w-px bg-zinc-800" />
                  <div className="space-y-6 relative">
                    <PipelineStep
                      number="1"
                      title="Extract claims from paper"
                      desc="Claude reads your paper, identifies the hypothesis, methodology, and every testable claim."
                      active={activeStep >= 1}
                      color="#06b6d4"
                    />
                    <PipelineStep
                      number="2"
                      title="Generate synthetic data"
                      desc="We create data matching the paper's experimental design — including saboteurs and controls."
                      active={activeStep >= 2}
                      color="#8b5cf6"
                    />
                    <PipelineStep
                      number="3"
                      title="Run computational models"
                      desc="AlphaFold, DiffDock, Boltz-2, GNINA, OpenMM and more via Tamarind Bio."
                      active={activeStep >= 3}
                      color="#f59e0b"
                    />
                    <PipelineStep
                      number="4"
                      title="Cross-validate & score"
                      desc="Multi-model consensus tells you which claims hold up — with evidence."
                      active={activeStep >= 4}
                      color="#10b981"
                    />
                  </div>
                </div>
              </div>

              {/* Example + Models */}
              <div className="space-y-5">
                <div className="animate-fade-in" style={{ animationDelay: "0.15s" }}>
                  <div className="text-xs uppercase tracking-[0.15em] text-zinc-500 mb-3">Example result</div>
                  <DemoResult />
                </div>

                <div className="animate-fade-in glass rounded-xl p-5" style={{ animationDelay: "0.2s" }}>
                  <div className="flex items-center gap-4">
                    <div className="text-3xl font-bold font-mono text-white">219</div>
                    <div>
                      <div className="text-sm text-zinc-400">computational models</div>
                      <div className="text-xs text-zinc-600">via Tamarind Bio</div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {["Structure Prediction", "Molecular Docking", "Binding Affinity", "Molecular Dynamics", "Protein Design"].map((cat) => (
                      <span key={cat} className="text-[10px] px-2 py-0.5 rounded bg-zinc-800/60 text-zinc-500">{cat}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
