"use client";

import { useEffect, useState } from "react";

const API = "http://localhost:8080";

// ── Types ──────────────────────────────────────────────────────────────

interface TamarindModel {
  id: string;
  name: string;
  category: string;
  description: string;
  validates: string[];
  limitations: string[];
}

interface ClaimEvidence {
  [key: string]: unknown;
}

interface ValidatedClaim {
  claim: string;
  category: string;
  paper_evidence: string;
  models_tested: string[];
  result: string;
  confidence: string;
  evidence: ClaimEvidence;
  conclusion: string;
}

interface AggregateResults {
  total_claims: number;
  validated: number;
  partially_validated: number;
  not_testable: number;
  invalidated: number;
  validation_rate: number;
  validation_summary: string;
}

interface ModelAgreement {
  binding_site: Record<string, string>;
  binding_affinity_ki_nm: Record<string, number | boolean>;
  rmsd_to_crystal_angstrom: Record<string, number | boolean>;
}

interface FinalVerdict {
  paper_validity: string;
  reliability_score: number;
  summary: string;
  confidence_factors: string[];
  remaining_gaps: string[];
}

interface ValidationResult {
  validation_id: string;
  paper_title: string;
  paper_journal: string;
  models_used: string[];
  overall_reliability_score: number;
  claims_validated: ValidatedClaim[];
  aggregate_results: AggregateResults;
  model_agreement_matrix: ModelAgreement;
  final_verdict: FinalVerdict;
}

interface ModelOutput {
  file: string;
  model: string;
  status: string;
}

// ── Helpers ────────────────────────────────────────────────────────────

const resultColor = (r: string) => {
  if (r === "validated") return "#22c55e";
  if (r === "partially_validated") return "#eab308";
  if (r === "not_testable") return "#6b7280";
  if (r === "invalidated") return "#ef4444";
  return "#6b7280";
};

const categoryIcon = (c: string) => {
  const map: Record<string, string> = {
    structure: "S",
    binding: "B",
    binding_affinity: "Kd",
    selectivity: "Sel",
    mechanism: "M",
    effector_disruption: "E",
    efficacy: "Rx",
  };
  return map[c] || c[0]?.toUpperCase() || "?";
};

const categoryColor = (c: string) => {
  const map: Record<string, string> = {
    structure: "#8b5cf6",
    binding: "#3b82f6",
    binding_affinity: "#06b6d4",
    selectivity: "#f59e0b",
    mechanism: "#10b981",
    effector_disruption: "#ef4444",
    efficacy: "#ec4899",
  };
  return map[c] || "#6b7280";
};

// ── Components ─────────────────────────────────────────────────────────

function ReliabilityGauge({ score }: { score: number }) {
  const pct = score * 100;
  const circumference = 2 * Math.PI * 54;
  const offset = circumference - (pct / 100) * circumference;
  const color = pct >= 85 ? "#22c55e" : pct >= 70 ? "#eab308" : "#ef4444";

  return (
    <div className="relative w-36 h-36">
      <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
        <circle cx="60" cy="60" r="54" fill="none" stroke="#27272a" strokeWidth="8" />
        <circle
          cx="60" cy="60" r="54" fill="none"
          stroke={color} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-1000"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold text-white font-mono">{pct.toFixed(0)}</span>
        <span className="text-[10px] text-zinc-500 uppercase tracking-wider">reliability</span>
      </div>
    </div>
  );
}

function ClaimCard({ claim, models }: { claim: ValidatedClaim; models: TamarindModel[] }) {
  const [open, setOpen] = useState(false);
  const modelNames = claim.models_tested.map(
    (id) => models.find((m) => m.id === id)?.name || id
  );

  return (
    <div
      className="bg-zinc-900/60 border border-zinc-800/60 rounded-lg overflow-hidden cursor-pointer transition-colors hover:border-zinc-700"
      onClick={() => setOpen(!open)}
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div
            className="w-8 h-8 rounded-md flex items-center justify-center text-xs font-bold shrink-0 mt-0.5"
            style={{ backgroundColor: categoryColor(claim.category) + "20", color: categoryColor(claim.category) }}
          >
            {categoryIcon(claim.category)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm text-zinc-200 leading-snug">{claim.claim}</p>
              <span
                className="text-[11px] px-2 py-0.5 rounded shrink-0 font-medium whitespace-nowrap"
                style={{
                  backgroundColor: resultColor(claim.result) + "18",
                  color: resultColor(claim.result),
                }}
              >
                {claim.result.replace(/_/g, " ")}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {modelNames.length > 0 ? modelNames.map((m) => (
                <span key={m} className="text-[10px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded">
                  {m}
                </span>
              )) : (
                <span className="text-[10px] text-zinc-600 italic">no computational model applicable</span>
              )}
              <span className="text-[10px] text-zinc-600 ml-auto">
                {claim.paper_evidence}
              </span>
            </div>
          </div>
        </div>
      </div>

      {open && (
        <div className="border-t border-zinc-800/60 p-4 space-y-3 bg-zinc-950/40">
          <p className="text-sm text-zinc-400 leading-relaxed">{claim.conclusion}</p>

          {Object.keys(claim.evidence).length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {Object.entries(claim.evidence).map(([k, v]) => {
                if (typeof v === "object") return null;
                return (
                  <div key={k} className="bg-zinc-800/40 rounded px-2 py-1.5">
                    <div className="text-[10px] text-zinc-600 truncate">{k.replace(/_/g, " ")}</div>
                    <div className="text-xs text-zinc-300 font-mono">
                      {typeof v === "boolean" ? (v ? "Yes" : "No") : String(v)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ModelPill({ model, active }: { model: TamarindModel; active: boolean }) {
  const catColor: Record<string, string> = {
    structure_prediction: "#8b5cf6",
    molecular_docking: "#3b82f6",
    molecular_dynamics: "#10b981",
    binding_energy: "#f59e0b",
  };
  const c = catColor[model.category] || "#6b7280";

  return (
    <div
      className={`rounded-lg border p-3 transition-all ${
        active ? "border-zinc-600 bg-zinc-800/60" : "border-zinc-800/40 bg-zinc-900/30 opacity-50"
      }`}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c }} />
        <span className="text-sm font-medium text-zinc-200">{model.name}</span>
      </div>
      <p className="text-[11px] text-zinc-500 leading-snug line-clamp-2">{model.description}</p>
    </div>
  );
}

function AgreementMatrix({ matrix }: { matrix: ModelAgreement }) {
  return (
    <div className="space-y-4">
      {/* Binding site consensus */}
      <div>
        <h4 className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Binding Site Consensus</h4>
        <div className="flex gap-2 flex-wrap">
          {Object.entries(matrix.binding_site)
            .filter(([k]) => k !== "consensus")
            .map(([model, site]) => (
              <div key={model} className="bg-zinc-800/50 rounded px-2.5 py-1.5 text-xs">
                <span className="text-zinc-500">{model}:</span>{" "}
                <span className="text-emerald-400">{site}</span>
              </div>
            ))}
        </div>
        <p className="text-xs text-emerald-500 mt-1">{matrix.binding_site.consensus}</p>
      </div>

      {/* Affinity comparison */}
      <div>
        <h4 className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Binding Affinity (Ki, nM)</h4>
        <div className="flex items-end gap-3">
          {Object.entries(matrix.binding_affinity_ki_nm)
            .filter(([k]) => !["mean", "paper_ic50", "within_2x"].includes(k))
            .map(([model, ki]) => {
              const val = Number(ki);
              const maxH = 80;
              const h = Math.min((val / 4) * maxH, maxH);
              return (
                <div key={model} className="flex flex-col items-center gap-1">
                  <span className="text-[10px] text-zinc-400 font-mono">{val}</span>
                  <div
                    className="w-10 rounded-t bg-cyan-500/60"
                    style={{ height: `${h}px` }}
                  />
                  <span className="text-[10px] text-zinc-600">{model.replace("autodock_", "")}</span>
                </div>
              );
            })}
          <div className="flex flex-col items-center gap-1 ml-4 border-l border-zinc-700 pl-4">
            <span className="text-[10px] text-amber-400 font-mono">
              {Number(matrix.binding_affinity_ki_nm.paper_ic50)}
            </span>
            <div
              className="w-10 rounded-t bg-amber-500/60"
              style={{ height: `${Math.min((Number(matrix.binding_affinity_ki_nm.paper_ic50) / 4) * 80, 80)}px` }}
            />
            <span className="text-[10px] text-amber-500">paper</span>
          </div>
        </div>
      </div>

      {/* RMSD comparison */}
      <div>
        <h4 className="text-xs text-zinc-500 uppercase tracking-wider mb-2">RMSD to Crystal Structure (Å)</h4>
        <div className="flex gap-2 flex-wrap">
          {Object.entries(matrix.rmsd_to_crystal_angstrom)
            .filter(([k]) => !["mean", "below_2A_threshold"].includes(k))
            .map(([model, rmsd]) => (
              <div key={model} className="bg-zinc-800/50 rounded px-2.5 py-1.5 text-xs">
                <span className="text-zinc-500">{model}:</span>{" "}
                <span className={Number(rmsd) <= 2 ? "text-emerald-400" : "text-amber-400"}>
                  {String(rmsd)} Å
                </span>
              </div>
            ))}
        </div>
        <p className="text-[11px] text-zinc-500 mt-1">
          Mean: {String(matrix.rmsd_to_crystal_angstrom.mean)} Å
          {matrix.rmsd_to_crystal_angstrom.below_2A_threshold && (
            <span className="text-emerald-500"> — all below 2.0 Å threshold</span>
          )}
        </p>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────

export default function ValidationPage() {
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [models, setModels] = useState<TamarindModel[]>([]);
  const [outputs, setOutputs] = useState<ModelOutput[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedOutput, setSelectedOutput] = useState<Record<string, unknown> | null>(null);
  const [selectedOutputName, setSelectedOutputName] = useState<string>("");

  useEffect(() => {
    Promise.all([
      fetch(`${API}/tamarind/experiments/kras_g12d/validation`).then((r) => r.json()),
      fetch(`${API}/tamarind/models`).then((r) => r.json()),
      fetch(`${API}/tamarind/experiments/kras_g12d/outputs`).then((r) => r.json()),
    ])
      .then(([val, cat, outs]) => {
        setValidation(val);
        // Extract model info from the index categories
        const allModels: TamarindModel[] = [];
        const categories = cat.categories || {};
        for (const [category, slugs] of Object.entries(categories)) {
          for (const slug of (slugs as string[])) {
            allModels.push({
              id: slug, name: slug, category, description: "",
              validates: [], limitations: [],
            });
          }
        }
        setModels(allModels);
        setOutputs(outs);
      })
      .catch((e) => setError(e.message));
  }, []);

  const loadOutput = async (filename: string) => {
    if (selectedOutputName === filename) {
      setSelectedOutput(null);
      setSelectedOutputName("");
      return;
    }
    const res = await fetch(`${API}/tamarind/experiments/kras_g12d/outputs/${filename}`);
    const data = await res.json();
    setSelectedOutput(data);
    setSelectedOutputName(filename);
  };

  if (error) {
    return (
      <div className="min-h-screen bg-zinc-950 text-red-400 p-8">
        <p>Failed to load: {error}</p>
        <p className="text-zinc-500 text-sm mt-2">Make sure the API is running on {API}</p>
      </div>
    );
  }

  if (!validation) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-zinc-500">Loading validation results...</div>
      </div>
    );
  }

  const agg = validation.aggregate_results;
  const verdict = validation.final_verdict;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-5xl mx-auto px-6 py-10 space-y-8">
        {/* Header */}
        <div className="flex items-start justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <a href="/" className="text-zinc-600 hover:text-zinc-400 text-sm transition-colors">&larr; Home</a>
              <span className="text-zinc-800">/</span>
              <a href="/alphafold" className="text-zinc-600 hover:text-zinc-400 text-sm transition-colors">AlphaFold</a>
            </div>
            <h1 className="text-2xl font-bold text-white">Paper Validation Report</h1>
            <p className="text-zinc-400 text-sm mt-1">{validation.paper_title}</p>
            <p className="text-zinc-600 text-xs mt-0.5">{validation.paper_journal}</p>
          </div>
          <ReliabilityGauge score={validation.overall_reliability_score} />
        </div>

        {/* Summary bar */}
        <div className="grid grid-cols-4 gap-3">
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-emerald-400 font-mono">{agg.validated}</div>
            <div className="text-[11px] text-emerald-500/70 mt-0.5">Validated</div>
          </div>
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-amber-400 font-mono">{agg.partially_validated}</div>
            <div className="text-[11px] text-amber-500/70 mt-0.5">Partial</div>
          </div>
          <div className="bg-zinc-500/10 border border-zinc-700/40 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-zinc-500 font-mono">{agg.not_testable}</div>
            <div className="text-[11px] text-zinc-600 mt-0.5">Not Testable</div>
          </div>
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-red-400 font-mono">{agg.invalidated}</div>
            <div className="text-[11px] text-red-500/70 mt-0.5">Invalidated</div>
          </div>
        </div>

        {/* Verdict */}
        <div className="rounded-xl bg-zinc-900/50 border border-zinc-800 p-5 space-y-3">
          <div className="flex items-center gap-2">
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: verdict.reliability_score >= 0.85 ? "#22c55e" : "#eab308" }}
            />
            <span className="text-sm font-semibold text-white">
              Paper validity: {verdict.paper_validity.replace(/_/g, " ")}
            </span>
          </div>
          <p className="text-sm text-zinc-400 leading-relaxed">{verdict.summary}</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div>
              <h4 className="text-xs text-emerald-500 uppercase tracking-wider mb-1.5">Confidence Factors</h4>
              <ul className="space-y-1">
                {verdict.confidence_factors.map((f, i) => (
                  <li key={i} className="text-xs text-zinc-400 flex gap-1.5">
                    <span className="text-emerald-600 shrink-0">+</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="text-xs text-amber-500 uppercase tracking-wider mb-1.5">Remaining Gaps</h4>
              <ul className="space-y-1">
                {verdict.remaining_gaps.map((g, i) => (
                  <li key={i} className="text-xs text-zinc-400 flex gap-1.5">
                    <span className="text-amber-600 shrink-0">~</span>
                    <span>{g}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Models Used */}
        <div>
          <h2 className="text-sm font-medium text-zinc-300 mb-3">
            Tamarind Bio Models ({validation.models_used.length})
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {models.map((m) => (
              <ModelPill key={m.id} model={m} active={validation.models_used.includes(m.id)} />
            ))}
          </div>
        </div>

        {/* Model Agreement */}
        <div className="border border-zinc-800 rounded-xl p-5">
          <h2 className="text-sm font-medium text-zinc-300 mb-4">Cross-Model Agreement</h2>
          <AgreementMatrix matrix={validation.model_agreement_matrix} />
        </div>

        {/* Claims */}
        <div>
          <h2 className="text-sm font-medium text-zinc-300 mb-3">
            Claim-by-Claim Validation ({agg.total_claims} claims)
          </h2>
          <div className="space-y-2">
            {validation.claims_validated.map((c, i) => (
              <ClaimCard key={i} claim={c} models={models} />
            ))}
          </div>
        </div>

        {/* Raw model outputs */}
        <div>
          <h2 className="text-sm font-medium text-zinc-300 mb-3">Model Outputs</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {outputs.map((o) => (
              <button
                key={o.file}
                onClick={() => loadOutput(o.file)}
                className={`text-left rounded-lg border p-3 transition-all text-xs ${
                  selectedOutputName === o.file
                    ? "border-zinc-600 bg-zinc-800/60"
                    : "border-zinc-800/40 bg-zinc-900/30 hover:border-zinc-700"
                }`}
              >
                <div className="text-zinc-300 font-medium truncate">{o.model}</div>
                <div className="text-zinc-600 truncate">{o.file.replace("_result.json", "")}</div>
                <div className="text-zinc-700 mt-1">{o.status}</div>
              </button>
            ))}
          </div>

          {selectedOutput && (
            <div className="mt-3 bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 overflow-auto max-h-[500px]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-zinc-500">{selectedOutputName}</span>
                <button
                  onClick={() => { setSelectedOutput(null); setSelectedOutputName(""); }}
                  className="text-xs text-zinc-600 hover:text-zinc-400"
                >
                  close
                </button>
              </div>
              <pre className="text-xs text-zinc-400 font-mono whitespace-pre-wrap">
                {JSON.stringify(selectedOutput, null, 2)}
              </pre>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-center text-xs text-zinc-700 pt-4 border-t border-zinc-900">
          Validated with {validation.models_used.length} Tamarind Bio models &middot; {agg.validation_summary}
        </div>
      </div>
    </div>
  );
}
