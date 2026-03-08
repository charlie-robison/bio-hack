"use client";

import { useEffect, useState } from "react";

const API = "http://localhost:8080";

/* ── Types ────────────────────────────────────────────────────────────── */

interface ClaimEvidence {
  [key: string]: unknown;
}

interface Claim {
  claim: string;
  category: string;
  paper_evidence: string;
  models_tested: string[];
  result: "validated" | "partially_validated" | "not_testable" | "invalidated";
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

interface FinalVerdict {
  paper_validity: string;
  reliability_score: number;
  summary: string;
  confidence_factors: string[];
  remaining_gaps: string[];
}

interface ModelAgreementMatrix {
  [key: string]: Record<string, unknown>;
}

interface ValidationData {
  validation_id: string;
  paper_run_id: string;
  paper_title: string;
  paper_journal: string;
  models_used: string[];
  overall_reliability_score: number;
  claims_validated: Claim[];
  aggregate_results: AggregateResults;
  model_agreement_matrix: ModelAgreementMatrix;
  final_verdict: FinalVerdict;
}

interface DiffDockPose {
  rank: number;
  confidence_score: number;
  binding_site: string;
  key_contacts: string[];
  switch_ii_contacts: number;
  p_loop_contacts: number;
  rmsd_to_pdb_7t47: number;
}

interface DiffDockResult {
  model_slug: string;
  runtime_seconds: number;
  poses: DiffDockPose[];
  summary: { top_pose_rmsd_to_crystal: number; verdict: string };
}

interface VinaPose {
  rank: number;
  binding_energy_kcal_mol: number;
  estimated_ki_nm: number;
  binding_site: string;
  key_contacts: string[];
}

interface VinaResult {
  model_slug: string;
  runtime_seconds: number;
  poses: VinaPose[];
  wt_comparison: { selectivity_ratio: number; wt_estimated_ki_nm: number; g12d_estimated_ki_nm: number };
  summary: { best_binding_energy: number; best_ki_estimate_nm: number; verdict: string };
}

interface GninaPose {
  rank: number;
  cnn_score: number;
  cnn_affinity: number;
  vina_score_kcal_mol: number;
  binding_site: string;
  rmsd_to_pdb_7t47: number;
}

interface GninaResult {
  model_slug: string;
  runtime_seconds: number;
  poses: GninaPose[];
  summary: { top_cnn_score: number; estimated_ki_nm: number; top_pose_rmsd: number; verdict: string };
}

interface Boltz2Result {
  model_slug: string;
  runtime_seconds: number;
  complex_prediction: {
    confidence_score: number;
    protein_plddt_mean: number;
    ligand_plddt_mean: number;
    interface_pae_mean: number;
    predicted_ki_nm: number;
    predicted_delta_g_kcal_mol: number;
    ligand_rmsd_to_pdb_7t47: number;
    hydrogen_bonds: { protein_residue: string; ligand_atom: string; distance: number }[];
    switch_ii_buried_surface_area_A2: number;
  };
  wt_comparison: { selectivity_ratio: number; wt_predicted_ki_nm: number };
  seeds_summary: { seed: number; ki_nm: number; ligand_rmsd: number; confidence: number }[];
  summary: { mean_ki_nm: number; verdict: string };
}

interface OpenMMSimulation {
  label: string;
  backbone_rmsd: { mean_angstrom: number };
  rmsf_key_regions: Record<string, number>;
  ligand_rmsd_mean_angstrom?: number;
}

interface OpenMMResult {
  model_slug: string;
  runtime_seconds: number;
  simulations: OpenMMSimulation[];
  comparative_analysis: {
    switch_ii_stabilization: { apo_rmsf: number; holo_gdp_rmsf: number; fold_reduction: number };
    switch_i_stabilization: { apo_rmsf: number; holo_gdp_rmsf: number; fold_reduction: number };
    nucleotide_independence: { gdp_switch_ii_rmsf: number; gtp_switch_ii_rmsf: number; difference: number };
  };
  summary: { verdict: string };
}

interface ProdigyRun {
  label: string;
  delta_g_kcal_mol: number;
  kd_nm: number;
  interface_contacts: { total: number };
  buried_surface_area_A2: number;
}

interface ProdigyResult {
  model_slug: string;
  runtime_seconds: number;
  runs: ProdigyRun[];
  comparative_analysis: {
    kd_ratio: number;
    interface_contact_reduction_percent: number;
    displaced_residues: string[];
  };
  summary: { verdict: string };
}

/* ── Helpers ──────────────────────────────────────────────────────────── */

function resultColor(result: string) {
  if (result === "validated") return "#22c55e";
  if (result === "partially_validated") return "#eab308";
  if (result === "not_testable") return "#6b7280";
  if (result === "invalidated") return "#ef4444";
  return "#6b7280";
}

function resultLabel(result: string) {
  if (result === "validated") return "Validated";
  if (result === "partially_validated") return "Partial";
  if (result === "not_testable") return "N/A";
  if (result === "invalidated") return "Invalidated";
  return result;
}

function confidenceColor(c: string) {
  if (c === "high") return "#22c55e";
  if (c === "medium") return "#eab308";
  if (c === "low") return "#ef4444";
  return "#6b7280";
}

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-zinc-800/60 rounded-lg p-3 border border-zinc-700/30">
      <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">{label}</div>
      <div className="text-zinc-100 font-mono text-sm leading-tight">{value}</div>
      {sub && <div className="text-[10px] text-zinc-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function ModelPill({ slug }: { slug: string }) {
  const colors: Record<string, string> = {
    alphafold: "#3b82f6",
    esmfold: "#6366f1",
    diffdock: "#f59e0b",
    gnina: "#f97316",
    "autodock-vina": "#ef4444",
    "boltz-2": "#8b5cf6",
    "chai-1": "#ec4899",
    "openmm-md": "#14b8a6",
    prodigy: "#06b6d4",
  };
  return (
    <span
      className="text-[10px] font-medium px-1.5 py-0.5 rounded"
      style={{
        backgroundColor: (colors[slug] || "#6b7280") + "20",
        color: colors[slug] || "#9ca3af",
      }}
    >
      {slug}
    </span>
  );
}

function formatRuntime(seconds: number): string {
  if (seconds >= 3600) return `${(seconds / 3600).toFixed(1)}h`;
  if (seconds >= 60) return `${(seconds / 60).toFixed(1)}m`;
  return `${seconds}s`;
}

/* ── Section Components ───────────────────────────────────────────────── */

function ReliabilityGauge({ score }: { score: number }) {
  const pct = score * 100;
  const color = pct >= 85 ? "#22c55e" : pct >= 70 ? "#eab308" : "#ef4444";
  return (
    <div className="flex items-center gap-4">
      <div className="relative w-20 h-20">
        <svg viewBox="0 0 36 36" className="w-20 h-20 -rotate-90">
          <circle cx="18" cy="18" r="15.5" fill="none" stroke="#27272a" strokeWidth="3" />
          <circle
            cx="18"
            cy="18"
            r="15.5"
            fill="none"
            stroke={color}
            strokeWidth="3"
            strokeDasharray={`${pct} ${100 - pct}`}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-lg font-bold font-mono" style={{ color }}>
            {pct.toFixed(0)}
          </span>
        </div>
      </div>
      <div>
        <div className="text-white font-semibold text-lg">Reliability Score</div>
        <div className="text-zinc-400 text-sm">Multi-model computational validation</div>
      </div>
    </div>
  );
}

function VerdictBanner({ verdict }: { verdict: FinalVerdict }) {
  const color =
    verdict.paper_validity === "strongly_supported"
      ? "#22c55e"
      : verdict.paper_validity === "supported"
        ? "#3b82f6"
        : "#eab308";

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <ReliabilityGauge score={verdict.reliability_score} />
        <span
          className="text-xs font-medium px-2.5 py-1 rounded-full shrink-0"
          style={{ backgroundColor: color + "20", color }}
        >
          {verdict.paper_validity.replace("_", " ")}
        </span>
      </div>
      <p className="text-sm text-zinc-300 leading-relaxed">{verdict.summary}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
        <div>
          <h4 className="text-xs font-medium text-emerald-400 mb-2 uppercase tracking-wider">
            Confidence Factors
          </h4>
          <ul className="space-y-1 text-xs text-zinc-400">
            {verdict.confidence_factors.map((f, i) => (
              <li key={i} className="flex gap-1.5">
                <span className="text-emerald-600 shrink-0 mt-0.5">+</span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h4 className="text-xs font-medium text-amber-400 mb-2 uppercase tracking-wider">
            Remaining Gaps
          </h4>
          <ul className="space-y-1 text-xs text-zinc-400">
            {verdict.remaining_gaps.map((g, i) => (
              <li key={i} className="flex gap-1.5">
                <span className="text-amber-600 shrink-0 mt-0.5">-</span>
                <span>{g}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function ClaimCard({ claim, index }: { claim: Claim; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const rc = resultColor(claim.result);

  return (
    <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/40 overflow-hidden">
      <button
        className="w-full text-left p-4 flex items-start gap-3 hover:bg-zinc-800/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-zinc-600 font-mono text-xs mt-0.5 shrink-0 w-4">{index + 1}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-zinc-200 leading-snug">{claim.claim}</p>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span
              className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
              style={{ backgroundColor: rc + "20", color: rc }}
            >
              {resultLabel(claim.result)}
            </span>
            <span
              className="text-[10px] px-1.5 py-0.5 rounded"
              style={{
                backgroundColor: confidenceColor(claim.confidence) + "15",
                color: confidenceColor(claim.confidence),
              }}
            >
              {claim.confidence} confidence
            </span>
            {claim.models_tested.map((m) => (
              <ModelPill key={m} slug={m} />
            ))}
          </div>
        </div>
        <span className="text-zinc-600 text-xs mt-1 shrink-0">{expanded ? "\u25B2" : "\u25BC"}</span>
      </button>
      {expanded && (
        <div className="px-4 pb-4 pt-0 ml-7 space-y-3 border-t border-zinc-800/40">
          <div className="pt-3">
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Paper Evidence</div>
            <p className="text-xs text-zinc-400">{claim.paper_evidence}</p>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Computational Evidence</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {Object.entries(claim.evidence).map(([key, val]) => (
                <div key={key} className="bg-zinc-800/40 rounded px-2 py-1.5">
                  <div className="text-[10px] text-zinc-500">{key.replace(/_/g, " ")}</div>
                  <div className="text-xs text-zinc-200 font-mono">{String(val)}</div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Conclusion</div>
            <p className="text-xs text-zinc-300 leading-relaxed">{claim.conclusion}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function AggregateBar({ agg }: { agg: AggregateResults }) {
  const total = agg.total_claims;
  const segments = [
    { count: agg.validated, color: "#22c55e", label: "Validated" },
    { count: agg.partially_validated, color: "#eab308", label: "Partial" },
    { count: agg.not_testable, color: "#6b7280", label: "N/A" },
    { count: agg.invalidated, color: "#ef4444", label: "Invalidated" },
  ];

  return (
    <div>
      <div className="flex h-3 rounded-full overflow-hidden mb-2">
        {segments
          .filter((s) => s.count > 0)
          .map((s) => (
            <div
              key={s.label}
              style={{ width: `${(s.count / total) * 100}%`, backgroundColor: s.color }}
            />
          ))}
      </div>
      <div className="flex gap-4 text-xs text-zinc-400">
        {segments
          .filter((s) => s.count > 0)
          .map((s) => (
            <span key={s.label} className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
              {s.count} {s.label}
            </span>
          ))}
      </div>
    </div>
  );
}

function DiffDockCard({ data }: { data: DiffDockResult }) {
  return (
    <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/40 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ModelPill slug="diffdock" />
          <span className="text-white font-medium text-sm">DiffDock</span>
        </div>
        <span className="text-zinc-500 text-xs font-mono">{formatRuntime(data.runtime_seconds)}</span>
      </div>
      <p className="text-xs text-zinc-400 leading-relaxed">{data.summary.verdict}</p>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Top Pose RMSD" value={`${data.poses[0].rmsd_to_pdb_7t47} \u00C5`} sub="vs PDB 7T47" />
        <Stat label="Confidence" value={data.poses[0].confidence_score} />
        <Stat label="Switch II Contacts" value={data.poses[0].switch_ii_contacts} />
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5">
          Pose Rankings
        </div>
        <div className="space-y-1">
          {data.poses.map((p) => (
            <div key={p.rank} className="flex items-center gap-2 text-xs">
              <span className="text-zinc-500 w-3 font-mono">#{p.rank}</span>
              <div className="flex-1 h-2 bg-zinc-800 rounded overflow-hidden">
                <div
                  className="h-full rounded"
                  style={{
                    width: `${p.confidence_score * 100}%`,
                    backgroundColor: p.confidence_score >= 0.7 ? "#22c55e" : p.confidence_score >= 0.5 ? "#eab308" : "#ef4444",
                  }}
                />
              </div>
              <span className="text-zinc-400 font-mono w-16 text-right">
                {p.rmsd_to_pdb_7t47} \u00C5
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function VinaCard({ data }: { data: VinaResult }) {
  return (
    <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/40 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ModelPill slug="autodock-vina" />
          <span className="text-white font-medium text-sm">AutoDock Vina</span>
        </div>
        <span className="text-zinc-500 text-xs font-mono">{formatRuntime(data.runtime_seconds)}</span>
      </div>
      <p className="text-xs text-zinc-400 leading-relaxed">{data.summary.verdict}</p>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Binding Energy" value={`${data.summary.best_binding_energy} kcal/mol`} />
        <Stat label="Ki Estimate" value={`${data.summary.best_ki_estimate_nm} nM`} sub="paper IC50 < 2 nM" />
        <Stat label="Selectivity" value={`${data.wt_comparison.selectivity_ratio}x`} sub="paper: 700x" />
      </div>
    </div>
  );
}

function GninaCard({ data }: { data: GninaResult }) {
  return (
    <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/40 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ModelPill slug="gnina" />
          <span className="text-white font-medium text-sm">GNINA</span>
        </div>
        <span className="text-zinc-500 text-xs font-mono">{formatRuntime(data.runtime_seconds)}</span>
      </div>
      <p className="text-xs text-zinc-400 leading-relaxed">{data.summary.verdict}</p>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="CNN Score" value={data.summary.top_cnn_score} />
        <Stat label="RMSD to Crystal" value={`${data.summary.top_pose_rmsd} \u00C5`} sub="best among docking" />
        <Stat label="Ki Estimate" value={`${data.summary.estimated_ki_nm} nM`} />
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5">CNN Scoring</div>
        <div className="space-y-1">
          {data.poses.map((p) => (
            <div key={p.rank} className="flex items-center gap-2 text-xs">
              <span className="text-zinc-500 w-3 font-mono">#{p.rank}</span>
              <div className="flex-1 h-2 bg-zinc-800 rounded overflow-hidden">
                <div
                  className="h-full rounded"
                  style={{
                    width: `${p.cnn_score * 100}%`,
                    backgroundColor: p.cnn_score >= 0.8 ? "#22c55e" : p.cnn_score >= 0.6 ? "#eab308" : "#ef4444",
                  }}
                />
              </div>
              <span className="text-zinc-400 font-mono w-8 text-right">{p.cnn_score}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Boltz2Card({ data }: { data: Boltz2Result }) {
  const cp = data.complex_prediction;
  return (
    <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/40 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ModelPill slug="boltz-2" />
          <span className="text-white font-medium text-sm">Boltz-2</span>
        </div>
        <span className="text-zinc-500 text-xs font-mono">{formatRuntime(data.runtime_seconds)}</span>
      </div>
      <p className="text-xs text-zinc-400 leading-relaxed">{data.summary.verdict}</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Stat label="Complex Confidence" value={cp.confidence_score} />
        <Stat label="Predicted Ki" value={`${cp.predicted_ki_nm} nM`} />
        <Stat label="Ligand RMSD" value={`${cp.ligand_rmsd_to_pdb_7t47} \u00C5`} />
        <Stat label="\u0394G" value={`${cp.predicted_delta_g_kcal_mol} kcal/mol`} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Protein pLDDT" value={cp.protein_plddt_mean} />
        <Stat label="Ligand pLDDT" value={cp.ligand_plddt_mean} />
        <Stat label="Interface PAE" value={`${cp.interface_pae_mean} \u00C5`} />
        <Stat label="Buried Surface" value={`${cp.switch_ii_buried_surface_area_A2} \u00C5\u00B2`} />
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5">H-Bonds</div>
        <div className="flex flex-wrap gap-1">
          {cp.hydrogen_bonds.map((hb, i) => (
            <span key={i} className="text-[10px] bg-zinc-800 text-zinc-300 px-1.5 py-0.5 rounded font-mono">
              {hb.protein_residue}\u2014{hb.ligand_atom} ({hb.distance}\u00C5)
            </span>
          ))}
        </div>
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5">Seed Consistency</div>
        <div className="flex gap-1">
          {data.seeds_summary.map((s) => (
            <div
              key={s.seed}
              className="flex-1 text-center bg-zinc-800/60 rounded py-1"
              title={`Seed ${s.seed}: Ki ${s.ki_nm}nM, RMSD ${s.ligand_rmsd}\u00C5`}
            >
              <div className="text-[10px] text-zinc-500">#{s.seed}</div>
              <div className="text-xs font-mono text-zinc-300">{s.ki_nm}</div>
              <div className="text-[9px] text-zinc-500">nM</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function OpenMMCard({ data }: { data: OpenMMResult }) {
  const ca = data.comparative_analysis;
  return (
    <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/40 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ModelPill slug="openmm-md" />
          <span className="text-white font-medium text-sm">OpenMM Molecular Dynamics</span>
        </div>
        <span className="text-zinc-500 text-xs font-mono">{formatRuntime(data.runtime_seconds)}</span>
      </div>
      <p className="text-xs text-zinc-400 leading-relaxed">{data.summary.verdict}</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <Stat
          label="Switch II Stabilization"
          value={`${ca.switch_ii_stabilization.fold_reduction}x`}
          sub={`${ca.switch_ii_stabilization.apo_rmsf} \u2192 ${ca.switch_ii_stabilization.holo_gdp_rmsf} \u00C5`}
        />
        <Stat
          label="Switch I Stabilization"
          value={`${ca.switch_i_stabilization.fold_reduction}x`}
          sub={`${ca.switch_i_stabilization.apo_rmsf} \u2192 ${ca.switch_i_stabilization.holo_gdp_rmsf} \u00C5`}
        />
        <Stat
          label="Nucleotide Independence"
          value={`\u0394${ca.nucleotide_independence.difference} \u00C5`}
          sub={`GDP: ${ca.nucleotide_independence.gdp_switch_ii_rmsf}, GTP: ${ca.nucleotide_independence.gtp_switch_ii_rmsf}`}
        />
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5">Simulations</div>
        <div className="space-y-2">
          {data.simulations.map((sim) => (
            <div key={sim.label} className="bg-zinc-800/40 rounded p-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-zinc-300">{sim.label.replace(/_/g, " ")}</span>
                <span className="text-[10px] text-zinc-500 font-mono">
                  backbone RMSD: {sim.backbone_rmsd.mean_angstrom} \u00C5
                </span>
              </div>
              <div className="grid grid-cols-4 gap-1">
                {Object.entries(sim.rmsf_key_regions).map(([region, val]) => (
                  <div key={region} className="text-center">
                    <div className="text-[9px] text-zinc-500">{region.replace(/_/g, " ").replace(/\d+/g, "").trim()}</div>
                    <div
                      className="text-xs font-mono"
                      style={{ color: val > 2.5 ? "#ef4444" : val > 1.5 ? "#eab308" : "#22c55e" }}
                    >
                      {val}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ProdigyCard({ data }: { data: ProdigyResult }) {
  const ca = data.comparative_analysis;
  return (
    <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/40 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ModelPill slug="prodigy" />
          <span className="text-white font-medium text-sm">PRODIGY</span>
        </div>
        <span className="text-zinc-500 text-xs font-mono">{formatRuntime(data.runtime_seconds)}</span>
      </div>
      <p className="text-xs text-zinc-400 leading-relaxed">{data.summary.verdict}</p>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Binding Disruption" value={`${ca.kd_ratio}x`} sub="weakened by drug" />
        <Stat label="Contact Loss" value={`${ca.interface_contact_reduction_percent}%`} sub="interface contacts" />
        <Stat
          label="KD Shift"
          value={`${data.runs[0].kd_nm} \u2192 ${data.runs[1].kd_nm} nM`}
          sub="apo \u2192 holo"
        />
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5">
          Displaced Interface Residues
        </div>
        <div className="flex flex-wrap gap-1">
          {ca.displaced_residues.map((r) => (
            <span key={r} className="text-[10px] bg-red-500/10 text-red-400 px-1.5 py-0.5 rounded font-mono">
              {r}
            </span>
          ))}
        </div>
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5">
          Binding Comparison
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-zinc-500 text-left">
              <th className="pb-1 font-medium">State</th>
              <th className="pb-1 font-medium">\u0394G (kcal/mol)</th>
              <th className="pb-1 font-medium">KD (nM)</th>
              <th className="pb-1 font-medium">Contacts</th>
              <th className="pb-1 font-medium">BSA (\u00C5\u00B2)</th>
            </tr>
          </thead>
          <tbody className="text-zinc-300 font-mono">
            {data.runs.map((r) => (
              <tr key={r.label}>
                <td className="py-0.5 font-sans text-zinc-400">{r.label.includes("apo") ? "Apo" : "Drug-bound"}</td>
                <td className="py-0.5">{r.delta_g_kcal_mol}</td>
                <td className="py-0.5">{r.kd_nm}</td>
                <td className="py-0.5">{r.interface_contacts.total}</td>
                <td className="py-0.5">{r.buried_surface_area_A2}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

<<<<<<< HEAD
function AgreementMatrix({ matrix }: { matrix: ModelAgreementMatrix }) {
  return (
    <div className="rounded-lg border border-zinc-800/60 bg-zinc-900/40 p-4 space-y-3">
      <h3 className="text-sm font-medium text-zinc-300">Cross-Model Agreement</h3>
      <div className="space-y-3">
        {Object.entries(matrix).map(([key, vals]) => (
          <div key={key}>
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
              {key.replace(/_/g, " ")}
=======
interface Comparison {
  claim: string;
  prediction_match?: string;
  alphafold_evidence?: string;
  agreement: string;
  confidence: string;
  explanation: string;
}

interface PaperComparison {
  paper_title: string;
  paper_journal?: string;
  proteins_mentioned?: string[];
  proteins_analyzed?: string[];
  paper_claims: { claim: string; category: string; evidence_type: string; paper_section?: string }[];
  comparisons: Comparison[];
  overall_assessment: {
    summary: string;
    prediction_reliability?: string;
    prediction_reliability_score?: number;
    structural_agreement?: string;
    key_agreements?: string[];
    key_validated_claims?: string[];
    key_discrepancies?: string[];
    key_limitations?: string[];
    binding_site_assessment?: string;
    recommendations: string[];
  };
}

function agreementColor(a: string) {
  if (a === "agrees") return "#22c55e";
  if (a === "partially_agrees") return "#eab308";
  if (a === "disagrees") return "#ef4444";
  return "#6b7280";
}

function ComparisonSection({ data }: { data: PaperComparison }) {
  const assessment = data.overall_assessment;
  const proteins = data.proteins_analyzed || data.proteins_mentioned || [];
  const agreements = assessment.key_validated_claims || assessment.key_agreements || [];
  const limitations = assessment.key_limitations || assessment.key_discrepancies || [];

  const relScore = assessment.prediction_reliability_score;
  const relLabel = assessment.prediction_reliability || (relScore && relScore >= 0.8 ? "high" : relScore && relScore >= 0.6 ? "medium" : "low");
  const relColor = relLabel === "high" ? "#22c55e" : relLabel === "medium" ? "#eab308" : "#ef4444";

  return (
    <div className="border border-zinc-800 rounded-xl p-6 space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-white">Paper vs Prediction Comparison</h2>
        <p className="text-zinc-400 text-sm mt-1">{data.paper_title}</p>
        {data.paper_journal && (
          <p className="text-zinc-500 text-xs mt-0.5">{data.paper_journal}</p>
        )}
        <div className="flex gap-2 mt-2 flex-wrap">
          {proteins.map((p) => (
            <span key={p} className="text-xs bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded">
              {p}
            </span>
          ))}
        </div>
      </div>

      <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: relColor }} />
          <span className="font-semibold text-white">
            Prediction reliability: {relLabel}{relScore ? ` (${(relScore * 100).toFixed(0)}%)` : ""}
          </span>
        </div>
        <p className="text-sm text-zinc-400">{assessment.summary}</p>
        {assessment.structural_agreement && (
          <p className="text-sm text-zinc-500 mt-2 italic">{assessment.structural_agreement}</p>
        )}
      </div>

      {assessment.binding_site_assessment && (
        <div className="rounded-lg bg-zinc-900/60 border border-zinc-800/60 p-4">
          <h3 className="text-sm font-medium text-amber-400 mb-1">Binding Site Assessment</h3>
          <p className="text-sm text-zinc-400">{assessment.binding_site_assessment}</p>
        </div>
      )}

      <div>
        <h3 className="text-sm font-medium text-zinc-300 mb-3">
          Claim-by-Claim Analysis ({data.comparisons.length} comparisons)
        </h3>
        <div className="space-y-3">
          {data.comparisons.map((c, i) => (
            <div key={i} className="bg-zinc-900/50 rounded-lg p-4 border border-zinc-800/50">
              <div className="flex items-start justify-between gap-3 mb-2">
                <p className="text-sm text-zinc-200 flex-1">{c.claim}</p>
                <span
                  className="text-xs px-2 py-0.5 rounded shrink-0 font-medium"
                  style={{ backgroundColor: agreementColor(c.agreement) + "20", color: agreementColor(c.agreement) }}
                >
                  {c.agreement.replace(/_/g, " ")}
                </span>
              </div>
              <p className="text-xs text-zinc-500 mb-1">
                {c.prediction_match && (<>vs <span className="text-zinc-400">{c.prediction_match}</span> &middot; </>)}
                confidence: {c.confidence}
              </p>
              {c.alphafold_evidence && (
                <p className="text-xs text-zinc-500 mb-2 bg-zinc-800/50 p-2 rounded">{c.alphafold_evidence}</p>
              )}
              <p className="text-sm text-zinc-400">{c.explanation}</p>
>>>>>>> 74bc1f3 (inference)
            </div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(vals).map(([model, val]) => (
                <div key={model} className="bg-zinc-800/60 rounded px-2 py-1">
                  <div className="text-[10px] text-zinc-500">{model.replace(/_/g, " ")}</div>
                  <div className="text-xs font-mono text-zinc-200">{String(val)}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
<<<<<<< HEAD
=======

      {(agreements.length > 0 || limitations.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {agreements.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-emerald-400 mb-2">
                {data.overall_assessment.key_validated_claims ? "Validated Claims" : "Agreements"}
              </h3>
              <ul className="space-y-1 text-sm text-zinc-400">
                {agreements.map((a, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-emerald-600 shrink-0">&bull;</span>
                    <span>{a}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {limitations.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-red-400 mb-2">
                {data.overall_assessment.key_limitations ? "Limitations" : "Discrepancies"}
              </h3>
              <ul className="space-y-1 text-sm text-zinc-400">
                {limitations.map((d, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-red-600 shrink-0">&bull;</span>
                    <span>{d}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {assessment.recommendations.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-zinc-300 mb-2">Recommendations</h3>
          <ul className="space-y-1 text-sm text-zinc-400">
            {assessment.recommendations.map((r, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-zinc-600 shrink-0">&rarr;</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
>>>>>>> 74bc1f3 (inference)
    </div>
  );
}

<<<<<<< HEAD
/* ── Main Page ────────────────────────────────────────────────────────── */
=======
export default function AlphaFoldAnalysis() {
  const [af2Mono, setAf2Mono] = useState<AF2Result | null>(null);
  const [af2Multi, setAf2Multi] = useState<AF2Result | null>(null);
  const [af3, setAf3] = useState<AF3Result | null>(null);
  const [krasResult, setKrasResult] = useState<AF2Result | null>(null);
  const [error, setError] = useState<string | null>(null);
>>>>>>> 74bc1f3 (inference)

export default function AlphaFoldAnalysis() {
  const [validation, setValidation] = useState<ValidationData | null>(null);
  const [diffdock, setDiffdock] = useState<DiffDockResult | null>(null);
  const [vina, setVina] = useState<VinaResult | null>(null);
  const [gnina, setGnina] = useState<GninaResult | null>(null);
  const [boltz2, setBoltz2] = useState<Boltz2Result | null>(null);
  const [openmm, setOpenmm] = useState<OpenMMResult | null>(null);
  const [prodigy, setProdigy] = useState<ProdigyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const base = `${API}/tamarind/experiments/kras_g12d`;
    Promise.all([
<<<<<<< HEAD
      fetch(`${base}/validation`).then((r) => r.json()),
      fetch(`${base}/outputs/diffdock_result.json`).then((r) => r.json()),
      fetch(`${base}/outputs/autodock-vina_result.json`).then((r) => r.json()),
      fetch(`${base}/outputs/gnina_result.json`).then((r) => r.json()),
      fetch(`${base}/outputs/boltz-2_result.json`).then((r) => r.json()),
      fetch(`${base}/outputs/openmm-md_result.json`).then((r) => r.json()),
      fetch(`${base}/outputs/prodigy_result.json`).then((r) => r.json()),
    ])
      .then(([val, dd, vi, gn, bo, om, pr]) => {
        setValidation(val);
        setDiffdock(dd);
        setVina(vi);
        setGnina(gn);
        setBoltz2(bo);
        setOpenmm(om);
        setProdigy(pr);
        setLoading(false);
=======
      fetch(`${API}/alphafold/results/sample`).then((r) => r.json()),
      fetch(`${API}/alphafold/results/multimer`).then((r) => r.json()),
      fetch(`${API}/alphafold/results/af3`).then((r) => r.json()),
      fetch(`${API}/alphafold/results/kras-g12d`).then((r) => r.json()).catch(() => null),
      fetch(`${API}/alphafold/compare/kras-g12d`).then((r) => r.json()).catch(() => null),
    ])
      .then(([mono, multi, af3Data, kras, krasComparison]) => {
        setAf2Mono(mono);
        setAf2Multi(multi);
        setAf3(af3Data);
        if (kras && !kras.detail) setKrasResult(kras);
        if (krasComparison && !krasComparison.detail) setComparison(krasComparison);
>>>>>>> 74bc1f3 (inference)
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, []);

  if (error) {
    return (
      <div className="min-h-screen bg-zinc-950 text-red-400 p-8">
        <p>Failed to load experiment data: {error}</p>
        <p className="text-zinc-500 text-sm mt-2">Make sure the API is running on {API}</p>
      </div>
    );
  }

  if (loading || !validation) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-zinc-600 border-t-zinc-200 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-zinc-500 text-sm">Loading experiment results...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-5xl mx-auto px-6 py-10 space-y-8">
        {/* Header */}
        <div>
          <div className="flex items-center gap-2 text-zinc-500 text-xs mb-2">
            <span>KRAS G12D / MRTX1133</span>
            <span>&middot;</span>
            <span>{validation.paper_journal}</span>
            <span>&middot;</span>
            <span>{validation.models_used.length} models</span>
          </div>
          <h1 className="text-2xl font-bold text-white leading-tight">
            {validation.paper_title}
          </h1>
          <div className="flex items-center gap-1.5 mt-3 flex-wrap">
            {validation.models_used.map((m) => (
              <ModelPill key={m} slug={m} />
            ))}
          </div>
        </div>

        {/* Verdict */}
        <VerdictBanner verdict={validation.final_verdict} />

        {/* Aggregate */}
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-zinc-300">
            Claims: {validation.aggregate_results.validation_summary}
          </h2>
          <AggregateBar agg={validation.aggregate_results} />
        </div>

<<<<<<< HEAD
        {/* Claims */}
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-white">Claim-by-Claim Validation</h2>
          <div className="space-y-1.5">
            {validation.claims_validated.map((c, i) => (
              <ClaimCard key={i} claim={c} index={i} />
            ))}
          </div>
        </div>

        {/* Model Results */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-white">Model Results</h2>
=======
        {/* KRAS G12D Findings Summary */}
        {comparison && krasResult && (
          <div className="border border-zinc-800 rounded-xl p-6 space-y-5 bg-zinc-900/30">
            <div>
              <h2 className="text-xl font-semibold text-white">KRAS G12D — Key Findings</h2>
              <p className="text-zinc-500 text-sm mt-1">
                AlphaFold 2 prediction vs. {comparison.paper_journal || "paper"}: <span className="italic">{comparison.paper_title}</span>
              </p>
            </div>

            {/* Reliability score bar */}
            {comparison.overall_assessment.prediction_reliability_score != null && (
              <div>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-zinc-400">Prediction Reliability</span>
                  <span className="font-mono text-white">
                    {(comparison.overall_assessment.prediction_reliability_score * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="h-3 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${comparison.overall_assessment.prediction_reliability_score * 100}%`,
                      backgroundColor: comparison.overall_assessment.prediction_reliability_score >= 0.8
                        ? "#22c55e"
                        : comparison.overall_assessment.prediction_reliability_score >= 0.6
                        ? "#eab308"
                        : "#ef4444",
                    }}
                  />
                </div>
              </div>
            )}

            {/* Agreement breakdown */}
            <div>
              <h3 className="text-sm font-medium text-zinc-300 mb-2">Agreement Breakdown</h3>
              <div className="grid grid-cols-3 gap-3">
                {(() => {
                  const agrees = comparison.comparisons.filter(c => c.agreement === "agrees").length;
                  const partial = comparison.comparisons.filter(c => c.agreement === "partially_agrees").length;
                  const notComp = comparison.comparisons.filter(c => c.agreement === "not_comparable" || c.agreement === "disagrees").length;
                  return (
                    <>
                      <div className="bg-zinc-800/60 rounded-lg p-3 text-center">
                        <div className="text-2xl font-mono font-bold text-emerald-400">{agrees}</div>
                        <div className="text-xs text-zinc-500 mt-1">Agrees</div>
                      </div>
                      <div className="bg-zinc-800/60 rounded-lg p-3 text-center">
                        <div className="text-2xl font-mono font-bold text-amber-400">{partial}</div>
                        <div className="text-xs text-zinc-500 mt-1">Partially Agrees</div>
                      </div>
                      <div className="bg-zinc-800/60 rounded-lg p-3 text-center">
                        <div className="text-2xl font-mono font-bold text-zinc-500">{notComp}</div>
                        <div className="text-xs text-zinc-500 mt-1">Not Comparable</div>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>

            {/* Key metrics from the AF2 prediction */}
            <div>
              <h3 className="text-sm font-medium text-zinc-300 mb-2">AF2 Prediction Metrics</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Stat label="Mean pLDDT" value={krasResult.models[0].mean_plddt} />
                <Stat label="pTM Score" value={krasResult.models[0].ptm_score} />
                <Stat label="Mean PAE" value={`${krasResult.models[0].pae_matrix_summary.mean_pae} \u00C5`} />
                <Stat label="Claims Analyzed" value={comparison.comparisons.length} />
              </div>
            </div>

            {/* Written findings */}
            <div className="space-y-3">
              <div>
                <h3 className="text-sm font-medium text-emerald-400 mb-1">What AlphaFold Validates</h3>
                <p className="text-sm text-zinc-400">
                  AF2 strongly confirms the canonical KRAS G12D fold with a well-defined P-loop at the G12D mutation site (pLDDT ~88).
                  Switch I (residues 30-40) and Switch II (residues 58-75) show intrinsic conformational flexibility (pLDDT 62-76),
                  consistent with the paper&apos;s claim that MRTX1133 exploits switch region plasticity to trap KRAS in an effector-incompatible conformation.
                  The Switch II pocket is structurally plausible as a druggable surface for non-covalent inhibition.
                </p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-amber-400 mb-1">Partial Support</h3>
                <p className="text-sm text-zinc-400">
                  AF2 supports the structural framework for MRTX1133 binding but cannot directly validate binding affinity (KD ~0.2 pM),
                  IC50 values, or the 700-fold selectivity over wild-type KRAS. The nucleotide-state-dependent conformations
                  (GDP vs. GMPPCP) are consistent with AF2&apos;s elevated uncertainty in switch regions, but AF2 generates a single
                  ligand-free model and cannot resolve state-specific pocket geometries.
                </p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-zinc-500 mb-1">Beyond AF2&apos;s Scope</h3>
                <p className="text-sm text-zinc-400">
                  Crystallographic metrics (resolution, B-factors, electron density), quantitative selectivity, cellular signaling
                  inhibition (pERK, pS6, p4EBP1), and in vivo tumor regression data cannot be assessed by AF2 monomer predictions.
                  These require experimental validation or complementary computational methods (molecular docking, MD simulations, AF-Multimer).
                </p>
              </div>
            </div>

            {/* C-terminal note */}
            <div className="rounded-lg bg-zinc-800/40 border border-zinc-800/60 px-4 py-3">
              <p className="text-xs text-zinc-500">
                <span className="text-zinc-400 font-medium">Note:</span> The C-terminal hypervariable region (residues 150-169)
                shows pLDDT dropping below 50, consistent with known intrinsic disorder in the membrane-proximal region.
                This does not affect the drug-binding analysis as MRTX1133 targets the G-domain core.
              </p>
            </div>
          </div>
        )}

        {/* KRAS G12D AF2 detailed results */}
        {krasResult && <AF2Section data={krasResult} title={`${krasResult.protein.name} — AF2 (KRAS G12D)`} />}
        {/* Full claim-by-claim comparison */}
        {comparison && <ComparisonSection data={comparison} />}

        {/* Generic sample predictions */}
        {af2Mono && <AF2Section data={af2Mono} title={`${af2Mono.protein.name} — AF2 Monomer`} />}
        {af2Multi && <AF2Section data={af2Multi} title={`${af2Multi.protein.name} — AF2 Multimer`} />}
        {af3 && <AF3Section data={af3} />}
>>>>>>> 74bc1f3 (inference)

          {/* Docking row */}
          <div>
            <h3 className="text-xs uppercase tracking-wider text-zinc-500 mb-2">
              Drug Binding Pose Prediction
            </h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {diffdock && <DiffDockCard data={diffdock} />}
              {gnina && <GninaCard data={gnina} />}
            </div>
          </div>

          {/* Affinity */}
          <div>
            <h3 className="text-xs uppercase tracking-wider text-zinc-500 mb-2">
              Binding Affinity & Selectivity
            </h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {vina && <VinaCard data={vina} />}
              {boltz2 && <Boltz2Card data={boltz2} />}
            </div>
          </div>

          {/* Dynamics */}
          <div>
            <h3 className="text-xs uppercase tracking-wider text-zinc-500 mb-2">
              Conformational Dynamics
            </h3>
            {openmm && <OpenMMCard data={openmm} />}
          </div>

          {/* Effector disruption */}
          <div>
            <h3 className="text-xs uppercase tracking-wider text-zinc-500 mb-2">
              Effector Disruption
            </h3>
            {prodigy && <ProdigyCard data={prodigy} />}
          </div>
        </div>

        {/* Cross-model agreement */}
        <AgreementMatrix matrix={validation.model_agreement_matrix} />
      </div>
    </div>
  );
}
