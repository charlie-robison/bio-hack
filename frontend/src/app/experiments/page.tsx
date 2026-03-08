"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const API = "http://localhost:8080";

/* ── Types ────────────────────────────────────────────────────────────── */

type Phase =
  | "idle"
  | "uploading"
  | "planning"
  | "plan_ready"
  | "starting"
  | "parsing"
  | "planning_models"
  | "submitting"
  | "running_models"
  | "downloading"
  | "validating"
  | "complete"
  | "error";

interface PlanJob {
  jobName: string;
  type: string;
  description: string;
  settings: Record<string, unknown>;
  validates_claims: string[];
  depends_on: string[];
  submission_status?: string;
  final_status?: string;
}

interface PlanStage {
  stage_number: number;
  stage_name: string;
  description: string;
  jobs: PlanJob[];
}

interface PlanClaim {
  claim: string;
  category: string;
  testable: boolean;
  models: string[];
}

interface ExperimentPlan {
  experiment_id: string;
  paper_title: string;
  paper_journal?: string;
  hypothesis: string;
  stages: PlanStage[];
  claims: PlanClaim[];
}

interface ExperimentStatus {
  status: string;
  stage: string;
  experiment_id?: string;
  validation_score?: number;
  error?: string;
  plan?: ExperimentPlan;
}

/* ── Stage pipeline config ────────────────────────────────────────────── */

const PIPELINE_STAGES: { key: string; label: string; icon: string }[] = [
  { key: "parsing", label: "Parse Paper", icon: "\u25A1" },
  { key: "planning", label: "Plan Models", icon: "\u25C7" },
  { key: "submitting", label: "Submit Jobs", icon: "\u25B3" },
  { key: "running_models", label: "Run Models", icon: "\u2B21" },
  { key: "downloading", label: "Download", icon: "\u25BD" },
  { key: "validating", label: "Validate", icon: "\u2B23" },
];

function stageIndex(stage: string): number {
  const idx = PIPELINE_STAGES.findIndex((s) => s.key === stage);
  return idx === -1 ? -1 : idx;
}

/* ── Helpers ──────────────────────────────────────────────────────────── */

const toolColors: Record<string, string> = {
  alphafold: "#3b82f6",
  esmfold: "#6366f1",
  diffdock: "#f59e0b",
  gnina: "#f97316",
  "autodock-vina": "#ef4444",
  boltz: "#8b5cf6",
  chai: "#ec4899",
  openmm: "#14b8a6",
  prodigy: "#06b6d4",
};

function ToolPill({ name }: { name: string }) {
  const c = toolColors[name] || "#6b7280";
  return (
    <span
      className="text-[10px] font-semibold px-1.5 py-0.5 rounded tracking-wide"
      style={{ backgroundColor: c + "18", color: c }}
    >
      {name}
    </span>
  );
}

/* ── Components ───────────────────────────────────────────────────────── */

function PipelineTracker({ currentStage }: { currentStage: string }) {
  const current = stageIndex(currentStage);

  return (
    <div className="flex items-center gap-0 w-full">
      {PIPELINE_STAGES.map((stage, i) => {
        const done = i < current;
        const active = i === current;
        const color = done
          ? "#22c55e"
          : active
            ? "#06b6d4"
            : "#3f3f46";

        return (
          <div key={stage.key} className="flex items-center flex-1 last:flex-none">
            {/* Node */}
            <div className="flex flex-col items-center gap-1.5 relative z-10">
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center text-sm transition-all duration-500"
                style={{
                  backgroundColor: color + "20",
                  borderColor: color,
                  borderWidth: "1.5px",
                  boxShadow: active ? `0 0 16px ${color}40` : "none",
                }}
              >
                {done ? (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M2.5 7L5.5 10L11.5 4" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                ) : active ? (
                  <div
                    className="w-3 h-3 rounded-full animate-pulse"
                    style={{ backgroundColor: color }}
                  />
                ) : (
                  <span style={{ color }} className="text-xs opacity-60">
                    {stage.icon}
                  </span>
                )}
              </div>
              <span
                className="text-[10px] tracking-wider uppercase whitespace-nowrap"
                style={{ color: done ? "#a1a1aa" : active ? "#06b6d4" : "#52525b" }}
              >
                {stage.label}
              </span>
            </div>
            {/* Connector line */}
            {i < PIPELINE_STAGES.length - 1 && (
              <div className="flex-1 h-px mx-1 relative -top-2.5">
                <div
                  className="h-full transition-all duration-700"
                  style={{
                    backgroundColor: done ? "#22c55e50" : "#27272a",
                    backgroundImage: active
                      ? `linear-gradient(90deg, #06b6d4 0%, transparent 100%)`
                      : "none",
                  }}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function PlanView({ plan }: { plan: ExperimentPlan }) {
  const totalJobs = plan.stages.reduce((n, s) => n + s.jobs.length, 0);

  return (
    <div className="space-y-5 animate-in">
      {/* Paper header */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
        <div className="text-[10px] uppercase tracking-[0.2em] text-cyan-600 mb-1.5">
          Experiment Plan
        </div>
        <h2 className="text-lg font-semibold text-white leading-snug">
          {plan.paper_title}
        </h2>
        {plan.paper_journal && (
          <p className="text-xs text-zinc-500 mt-1">{plan.paper_journal}</p>
        )}
        <p className="text-sm text-zinc-400 mt-2">{plan.hypothesis}</p>
        <div className="flex gap-3 mt-3 text-xs text-zinc-500">
          <span>
            <span className="text-zinc-200 font-mono">{plan.stages.length}</span> stages
          </span>
          <span>
            <span className="text-zinc-200 font-mono">{totalJobs}</span> jobs
          </span>
          <span>
            <span className="text-zinc-200 font-mono">{plan.claims.length}</span> claims
          </span>
        </div>
      </div>

      {/* Stages */}
      <div className="space-y-3">
        {plan.stages.map((stage) => (
          <div
            key={stage.stage_number}
            className="rounded-lg border border-zinc-800/60 bg-zinc-900/40 p-4"
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="text-cyan-700 font-mono text-xs">
                S{stage.stage_number}
              </span>
              <span className="text-sm font-medium text-zinc-200">
                {stage.stage_name}
              </span>
            </div>
            <p className="text-xs text-zinc-500 mb-3">{stage.description}</p>
            <div className="space-y-2">
              {stage.jobs.map((job) => (
                <div
                  key={job.jobName}
                  className="flex items-start gap-3 bg-zinc-800/30 rounded p-2.5"
                >
                  <ToolPill name={job.type} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-zinc-300">{job.description}</div>
                    <div className="text-[10px] text-zinc-600 font-mono mt-0.5">
                      {job.jobName}
                    </div>
                  </div>
                  {job.final_status && (
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded shrink-0"
                      style={{
                        backgroundColor:
                          job.final_status === "Complete"
                            ? "#22c55e20"
                            : "#ef444420",
                        color:
                          job.final_status === "Complete"
                            ? "#22c55e"
                            : "#ef4444",
                      }}
                    >
                      {job.final_status}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Claims */}
      {plan.claims.length > 0 && (
        <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/40 p-4">
          <div className="text-[10px] uppercase tracking-[0.15em] text-zinc-500 mb-2">
            Paper Claims to Validate
          </div>
          <div className="space-y-1.5">
            {plan.claims.map((c, i) => (
              <div
                key={i}
                className="flex items-start gap-2 text-xs"
              >
                <span className="text-zinc-600 font-mono w-4 shrink-0 mt-0.5">
                  {i + 1}
                </span>
                <span className="text-zinc-300 flex-1">{c.claim}</span>
                <div className="flex gap-1 shrink-0">
                  {c.models.map((m) => (
                    <ToolPill key={m} name={m} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ResultsBanner({
  score,
  experimentId,
}: {
  score: number;
  experimentId: string;
}) {
  const pct = Math.round(score * 100);
  const color = pct >= 85 ? "#22c55e" : pct >= 70 ? "#eab308" : "#ef4444";

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-emerald-600 mb-1">
            Validation Complete
          </div>
          <div className="text-2xl font-bold font-mono" style={{ color }}>
            {pct}%
          </div>
          <div className="text-xs text-zinc-500 mt-0.5">
            Reliability Score
          </div>
        </div>
        <a
          href={`/alphafold`}
          className="text-xs px-3 py-1.5 rounded-lg bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 transition-colors"
        >
          View Full Report &rarr;
        </a>
      </div>
      <div className="mt-3 h-2 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-1000"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <p className="text-[10px] text-zinc-600 mt-2 font-mono">
        experiment: {experimentId}
      </p>
    </div>
  );
}

/* ── Main Page ────────────────────────────────────────────────────────── */

export default function ExperimentsPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [dragActive, setDragActive] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [plan, setPlan] = useState<ExperimentPlan | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [experimentId, setExperimentId] = useState<string | null>(null);
  const [validationScore, setValidationScore] = useState<number | null>(null);
  const [currentStage, setCurrentStage] = useState<string>("parsing");

  const fileRef = useRef<File | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  /* ── File handling ─────────────────────────────────────────── */

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
    else if (e.type === "dragleave") setDragActive(false);
  }, []);

  const selectFile = (file: File) => {
    if (!file.type.includes("pdf")) {
      setError("Only PDF files are accepted");
      return;
    }
    fileRef.current = file;
    setFileName(file.name);
    setError(null);
    setPlan(null);
    setRunId(null);
    setExperimentId(null);
    setValidationScore(null);
    setPhase("idle");
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.[0]) selectFile(e.dataTransfer.files[0]);
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) selectFile(e.target.files[0]);
  };

  /* ── Preview plan ──────────────────────────────────────────── */

  const previewPlan = async () => {
    if (!fileRef.current) return;
    setPhase("planning");
    setError(null);

    const form = new FormData();
    form.append("file", fileRef.current);

    try {
      const res = await fetch(`${API}/experiments/plan`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail || `Plan failed (${res.status})`);
      }
      const data: ExperimentPlan = await res.json();
      setPlan(data);
      setPhase("plan_ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Planning failed");
      setPhase("error");
    }
  };

  /* ── Run experiment ────────────────────────────────────────── */

  const runExperiment = async () => {
    if (!fileRef.current) return;
    setPhase("uploading");
    setError(null);

    const form = new FormData();
    form.append("file", fileRef.current);

    try {
      const res = await fetch(`${API}/experiments/run-from-pdf`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail || `Submit failed (${res.status})`);
      }
      const data = await res.json();
      setRunId(data.run_id);
      setPhase("starting");
      setCurrentStage("parsing");
      startPolling(data.run_id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start experiment");
      setPhase("error");
    }
  };

  const startPolling = (rid: string) => {
    if (pollRef.current) clearInterval(pollRef.current);

    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${API}/experiments/status/${rid}`);
        if (!res.ok) return;
        const data: ExperimentStatus = await res.json();

        // Map backend stages to our phase
        if (data.stage) setCurrentStage(data.stage);
        if (data.plan && !plan) setPlan(data.plan);
        if (data.experiment_id) setExperimentId(data.experiment_id);

        const stageToPhase: Record<string, Phase> = {
          parsing: "parsing",
          planning: "planning_models",
          submitting: "submitting",
          running_models: "running_models",
          downloading: "downloading",
          validating: "validating",
          done: "complete",
          error: "error",
        };

        const newPhase = stageToPhase[data.stage] || phase;

        if (data.status === "complete") {
          setPhase("complete");
          setValidationScore(data.validation_score ?? null);
          if (data.plan) setPlan(data.plan);
          if (data.experiment_id) setExperimentId(data.experiment_id);
          if (pollRef.current) clearInterval(pollRef.current);
        } else if (data.status === "failed") {
          setPhase("error");
          setError(data.error || "Experiment failed");
          if (pollRef.current) clearInterval(pollRef.current);
        } else {
          setPhase(newPhase);
        }
      } catch {
        // Ignore transient fetch errors
      }
    }, 3000);
  };

  /* ── Reset ─────────────────────────────────────────────────── */

  const reset = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    fileRef.current = null;
    setPhase("idle");
    setFileName(null);
    setError(null);
    setPlan(null);
    setRunId(null);
    setExperimentId(null);
    setValidationScore(null);
    setCurrentStage("parsing");
  };

  /* ── Derived state ─────────────────────────────────────────── */

  const isRunning = [
    "uploading",
    "starting",
    "parsing",
    "planning_models",
    "submitting",
    "running_models",
    "downloading",
    "validating",
  ].includes(phase);

  const showTracker = isRunning || phase === "complete";
  const hasFile = !!fileName;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Subtle grid background */}
      <div
        className="fixed inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(rgba(6,182,212,0.3) 1px, transparent 1px),
            linear-gradient(90deg, rgba(6,182,212,0.3) 1px, transparent 1px)
          `,
          backgroundSize: "40px 40px",
        }}
      />

      <div className="relative max-w-4xl mx-auto px-6 py-10 space-y-6">
        {/* Header */}
        <div className="flex items-end justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.25em] text-cyan-700 mb-1">
              Tamarind Bio
            </div>
            <h1 className="text-2xl font-bold text-white">
              Experiment Runner
            </h1>
            <p className="text-sm text-zinc-500 mt-1">
              Upload a paper. Validate its claims with computational models.
            </p>
          </div>
          {phase !== "idle" && (
            <button
              onClick={reset}
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors px-3 py-1.5 rounded-lg border border-zinc-800 hover:border-zinc-700"
            >
              New Experiment
            </button>
          )}
        </div>

        {/* Pipeline tracker */}
        {showTracker && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
            <PipelineTracker currentStage={currentStage} />
            {isRunning && (
              <div className="flex items-center gap-2 mt-4 text-xs text-zinc-500">
                <div className="w-3 h-3 border border-cyan-600 border-t-transparent rounded-full animate-spin" />
                <span>
                  {currentStage === "running_models"
                    ? "Models running on Tamarind Bio..."
                    : `${currentStage.replace(/_/g, " ")}...`}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Upload area (shown when idle or file selected but not running) */}
        {(phase === "idle" || phase === "plan_ready" || phase === "planning") &&
          !isRunning && (
            <div>
              <div
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                className={`
                  relative rounded-xl border-2 border-dashed p-10 text-center transition-all cursor-pointer
                  ${
                    dragActive
                      ? "border-cyan-500 bg-cyan-500/5"
                      : hasFile
                        ? "border-zinc-700 bg-zinc-900/30"
                        : "border-zinc-800 hover:border-zinc-600 bg-zinc-900/20"
                  }
                  ${phase === "planning" ? "pointer-events-none opacity-50" : ""}
                `}
              >
                <input
                  type="file"
                  accept=".pdf"
                  onChange={handleFileInput}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  disabled={phase === "planning"}
                />

                {hasFile ? (
                  <div className="space-y-2">
                    <div className="w-10 h-10 mx-auto rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#06b6d4"
                        strokeWidth="2"
                      >
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                        <path d="M14 2v6h6" />
                      </svg>
                    </div>
                    <p className="text-sm text-zinc-200 font-medium">
                      {fileName}
                    </p>
                    <p className="text-[10px] text-zinc-600">
                      Click or drop to replace
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="w-10 h-10 mx-auto rounded-lg bg-zinc-800/60 flex items-center justify-center">
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#52525b"
                        strokeWidth="2"
                      >
                        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                      </svg>
                    </div>
                    <p className="text-sm text-zinc-400">
                      Drop a research paper PDF
                    </p>
                    <p className="text-[10px] text-zinc-600">or click to browse</p>
                  </div>
                )}
              </div>

              {/* Action buttons */}
              {hasFile && phase !== "planning" && (
                <div className="flex gap-3 mt-4">
                  <button
                    onClick={previewPlan}
                    className="flex-1 text-sm py-2.5 rounded-lg border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white transition-colors"
                  >
                    Preview Plan
                  </button>
                  <button
                    onClick={runExperiment}
                    className="flex-1 text-sm py-2.5 rounded-lg bg-cyan-600 text-white hover:bg-cyan-500 transition-colors font-medium"
                  >
                    Run Experiment
                  </button>
                </div>
              )}

              {phase === "planning" && (
                <div className="flex items-center justify-center gap-2 mt-4 text-sm text-zinc-500">
                  <div className="w-4 h-4 border-2 border-cyan-600 border-t-transparent rounded-full animate-spin" />
                  Analyzing paper with Claude Opus...
                </div>
              )}
            </div>
          )}

        {/* Error */}
        {error && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {/* Plan view */}
        {plan && <PlanView plan={plan} />}

        {/* Run button after plan preview */}
        {phase === "plan_ready" && plan && (
          <button
            onClick={runExperiment}
            className="w-full text-sm py-3 rounded-lg bg-cyan-600 text-white hover:bg-cyan-500 transition-colors font-medium"
          >
            Run This Experiment on Tamarind Bio
          </button>
        )}

        {/* Completion */}
        {phase === "complete" && validationScore != null && experimentId && (
          <ResultsBanner score={validationScore} experimentId={experimentId} />
        )}

        {/* Existing experiments */}
        {phase === "idle" && <ExistingExperiments />}
      </div>
    </div>
  );
}

/* ── Existing Experiments List ─────────────────────────────────────────── */

function ExistingExperiments() {
  const [experiments, setExperiments] = useState<
    { id: string; has_pipeline: boolean; has_validation: boolean }[]
  >([]);

  useEffect(() => {
    fetch(`${API}/tamarind/experiments`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setExperiments(data);
      })
      .catch(() => {});
  }, []);

  if (experiments.length === 0) return null;

  return (
    <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/30 p-5">
      <div className="text-[10px] uppercase tracking-[0.15em] text-zinc-500 mb-3">
        Previous Experiments
      </div>
      <div className="space-y-2">
        {experiments.map((exp) => (
          <a
            key={exp.id}
            href={`/alphafold`}
            className="flex items-center justify-between p-3 rounded-lg bg-zinc-800/30 hover:bg-zinc-800/50 transition-colors group"
          >
            <div className="flex items-center gap-3">
              <span className="text-sm text-zinc-300 font-mono group-hover:text-white transition-colors">
                {exp.id}
              </span>
              {exp.has_validation && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500">
                  validated
                </span>
              )}
              {exp.has_pipeline && !exp.has_validation && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500">
                  pipeline only
                </span>
              )}
            </div>
            <span className="text-zinc-600 text-xs group-hover:text-zinc-400 transition-colors">
              &rarr;
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}
