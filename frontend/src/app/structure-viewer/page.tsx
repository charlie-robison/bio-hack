"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { ArrowLeft, Download, ExternalLink, Loader2, Info, Dna, Atom, Grid3X3, Settings2 } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

interface Metrics {
  avg_plddt: number;
  max_pae: number;
  mean_pae: number;
  ptm: number;
  model: string;
  rank: string;
  sequence: string;
  max_plddt: number;
}

interface StructureData {
  protein_name: string;
  model_type: string;
  metrics: Metrics;
  config: Record<string, unknown>;
  templates: Record<string, string[]>;
  plddt: number[];
  max_pae: number;
}

interface PAEData {
  pae: number[][];
  original_size: number;
  downsampled_size: number;
  max_error: number;
}

// AlphaFold confidence color scheme
function getPlddtColor(score: number): string {
  if (score > 90) return "#0077B6"; // Very high - dark blue
  if (score > 70) return "#00B4D8"; // Confident - cyan
  if (score > 50) return "#FFB703"; // Low - yellow
  return "#FB8500"; // Very low - orange
}

function getPlddtLabel(score: number): string {
  if (score > 90) return "Very high";
  if (score > 70) return "Confident";
  if (score > 50) return "Low";
  return "Very low";
}

// PAE color (green = good, yellow/red = bad)
function getPaeColor(error: number, maxError: number): string {
  const normalized = error / maxError;
  if (normalized < 0.2) return "#0A9396";
  if (normalized < 0.4) return "#94D2BD";
  if (normalized < 0.6) return "#E9D8A6";
  if (normalized < 0.8) return "#EE9B00";
  return "#CA6702";
}

function MetricCard({ label, value, unit, color, description }: {
  label: string;
  value: string | number;
  unit?: string;
  color?: string;
  description?: string;
}) {
  return (
    <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-5 border border-slate-700/50 hover:border-cyan-500/30 transition-all group">
      <div className="flex items-start justify-between">
        <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">{label}</span>
        {description && (
          <div className="relative">
            <Info className="h-3.5 w-3.5 text-slate-500 cursor-help" />
            <div className="absolute right-0 top-6 w-48 p-2 bg-slate-900 rounded-lg text-xs text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 border border-slate-700">
              {description}
            </div>
          </div>
        )}
      </div>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="text-3xl font-bold font-mono" style={{ color: color || "#fff" }}>
          {typeof value === "number" ? value.toFixed(2) : value}
        </span>
        {unit && <span className="text-sm text-slate-500">{unit}</span>}
      </div>
    </div>
  );
}

function PlddtChart({ plddt }: { plddt: number[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  // Group into regions for smoother visualization
  const step = Math.max(1, Math.floor(plddt.length / 150));
  const grouped = [];
  for (let i = 0; i < plddt.length; i += step) {
    const slice = plddt.slice(i, i + step);
    const avg = slice.reduce((a, b) => a + b, 0) / slice.length;
    grouped.push({ start: i + 1, end: Math.min(i + step, plddt.length), avg });
  }

  return (
    <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 border border-slate-700/50">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Dna className="h-5 w-5 text-cyan-400" />
            Predicted Local Distance Difference Test (pLDDT)
          </h3>
          <p className="text-sm text-slate-400 mt-1">Per-residue model confidence score</p>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm" style={{ background: "#0077B6" }} />
            <span className="text-slate-400">&gt;90</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm" style={{ background: "#00B4D8" }} />
            <span className="text-slate-400">70-90</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm" style={{ background: "#FFB703" }} />
            <span className="text-slate-400">50-70</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm" style={{ background: "#FB8500" }} />
            <span className="text-slate-400">&lt;50</span>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div ref={containerRef} className="relative h-32">
        <div className="absolute inset-0 flex items-end gap-px">
          {grouped.map((g, i) => (
            <div
              key={i}
              className="flex-1 min-w-[2px] rounded-t cursor-pointer transition-all hover:opacity-80"
              style={{
                height: `${g.avg}%`,
                background: getPlddtColor(g.avg),
                boxShadow: hoveredIdx === i ? `0 0 10px ${getPlddtColor(g.avg)}80` : "none",
              }}
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
            />
          ))}
        </div>

        {/* Hover tooltip */}
        {hoveredIdx !== null && grouped[hoveredIdx] && (
          <div
            className="absolute top-0 bg-slate-900/95 backdrop-blur rounded-lg px-3 py-2 text-xs border border-slate-700 pointer-events-none z-10"
            style={{
              left: `${(hoveredIdx / grouped.length) * 100}%`,
              transform: "translateX(-50%)",
            }}
          >
            <div className="text-slate-400">
              Residue {grouped[hoveredIdx].start}
              {grouped[hoveredIdx].end !== grouped[hoveredIdx].start && `-${grouped[hoveredIdx].end}`}
            </div>
            <div className="font-mono font-bold" style={{ color: getPlddtColor(grouped[hoveredIdx].avg) }}>
              {grouped[hoveredIdx].avg.toFixed(1)} — {getPlddtLabel(grouped[hoveredIdx].avg)}
            </div>
          </div>
        )}

        {/* Y-axis labels */}
        <div className="absolute -left-8 inset-y-0 flex flex-col justify-between text-xs text-slate-500 font-mono">
          <span>100</span>
          <span>50</span>
          <span>0</span>
        </div>
      </div>

      {/* X-axis */}
      <div className="flex justify-between mt-2 text-xs text-slate-500 font-mono px-1">
        <span>1</span>
        <span>{Math.floor(plddt.length / 2)}</span>
        <span>{plddt.length}</span>
      </div>
    </div>
  );
}

function PAEHeatmap({ paeData }: { paeData: PAEData }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoveredCell, setHoveredCell] = useState<{ x: number; y: number; value: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !paeData.pae.length) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const size = paeData.pae.length;
    canvas.width = size;
    canvas.height = size;

    for (let i = 0; i < size; i++) {
      for (let j = 0; j < size; j++) {
        const val = paeData.pae[i]?.[j] ?? 0;
        ctx.fillStyle = getPaeColor(val, paeData.max_error);
        ctx.fillRect(j, i, 1, 1);
      }
    }
  }, [paeData]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = Math.floor((e.clientX - rect.left) * scaleX);
    const y = Math.floor((e.clientY - rect.top) * scaleY);

    if (x >= 0 && y >= 0 && y < paeData.pae.length && x < paeData.pae[0]?.length) {
      setHoveredCell({ x, y, value: paeData.pae[y][x] });
    }
  };

  return (
    <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 border border-slate-700/50">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Grid3X3 className="h-5 w-5 text-cyan-400" />
            Predicted Aligned Error (PAE)
          </h3>
          <p className="text-sm text-slate-400 mt-1">Inter-residue position confidence</p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-400">0 Å</span>
          <div className="w-24 h-3 rounded" style={{
            background: "linear-gradient(to right, #0A9396, #94D2BD, #E9D8A6, #EE9B00, #CA6702)"
          }} />
          <span className="text-slate-400">{paeData.max_error.toFixed(0)} Å</span>
        </div>
      </div>

      <div className="relative aspect-square max-w-md mx-auto">
        <canvas
          ref={canvasRef}
          className="w-full h-full rounded-lg cursor-crosshair"
          style={{ imageRendering: "pixelated" }}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoveredCell(null)}
        />

        {/* Axis labels */}
        <div className="absolute -bottom-6 left-0 right-0 text-center text-xs text-slate-500">
          Scored residue
        </div>
        <div className="absolute -left-6 top-0 bottom-0 flex items-center">
          <span className="text-xs text-slate-500 -rotate-90 whitespace-nowrap">Aligned residue</span>
        </div>

        {/* Hover tooltip */}
        {hoveredCell && (
          <div className="absolute top-2 right-2 bg-slate-900/95 backdrop-blur rounded-lg px-3 py-2 text-xs border border-slate-700">
            <div className="text-slate-400">
              Position ({hoveredCell.x + 1}, {hoveredCell.y + 1})
            </div>
            <div className="font-mono font-bold text-white">
              {hoveredCell.value.toFixed(2)} Å
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SequenceViewer({ sequence, plddt }: { sequence: string; plddt: number[] }) {
  const [expanded, setExpanded] = useState(false);
  const displaySeq = expanded ? sequence : sequence.slice(0, 100);

  return (
    <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 border border-slate-700/50">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <Atom className="h-5 w-5 text-cyan-400" />
          Sequence
        </h3>
        <span className="text-sm text-slate-400">{sequence.length} residues</span>
      </div>

      <div className="font-mono text-sm leading-relaxed break-all">
        {displaySeq.split("").map((aa, i) => (
          <span
            key={i}
            className="inline-block w-4 text-center cursor-default hover:scale-125 transition-transform"
            style={{ color: plddt[i] ? getPlddtColor(plddt[i]) : "#94a3b8" }}
            title={`${aa}${i + 1}: pLDDT ${plddt[i]?.toFixed(1) || "N/A"}`}
          >
            {aa}
          </span>
        ))}
        {!expanded && sequence.length > 100 && (
          <span className="text-slate-500">...</span>
        )}
      </div>

      {sequence.length > 100 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-3 text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
        >
          {expanded ? "Show less" : `Show all ${sequence.length} residues`}
        </button>
      )}
    </div>
  );
}

function TemplateList({ templates }: { templates: Record<string, string[]> }) {
  const allTemplates = Object.values(templates).flat().slice(0, 10);

  return (
    <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 border border-slate-700/50">
      <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
        <Settings2 className="h-5 w-5 text-cyan-400" />
        Template Structures
      </h3>
      <div className="flex flex-wrap gap-2">
        {allTemplates.map((pdb, i) => {
          const pdbId = pdb.split("_")[0].toUpperCase();
          return (
            <a
              key={i}
              href={`https://www.rcsb.org/structure/${pdbId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-700/50 hover:bg-cyan-500/20 rounded-lg text-sm font-mono text-slate-300 hover:text-cyan-400 transition-all border border-transparent hover:border-cyan-500/30"
            >
              {pdb}
              <ExternalLink className="h-3 w-3 opacity-50" />
            </a>
          );
        })}
      </div>
    </div>
  );
}

export default function StructureViewerPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [structureData, setStructureData] = useState<StructureData | null>(null);
  const [paeData, setPaeData] = useState<PAEData | null>(null);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const [structRes, paeRes] = await Promise.all([
          fetch(`${API}/example-output/structure`),
          fetch(`${API}/example-output/pae`),
        ]);

        if (!structRes.ok) throw new Error("Failed to load structure data");

        setStructureData(await structRes.json());
        if (paeRes.ok) setPaeData(await paeRes.json());
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load data");
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-400">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading structure data...
        </div>
      </div>
    );
  }

  if (error || !structureData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 mb-4">{error || "No data available"}</p>
          <Link href="/" className="text-cyan-400 hover:text-cyan-300">
            Go back
          </Link>
        </div>
      </div>
    );
  }

  const { metrics, plddt, templates } = structureData;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/* Subtle grid pattern */}
      <div
        className="fixed inset-0 opacity-[0.02] pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(rgba(6, 182, 212, 0.5) 1px, transparent 1px),
            linear-gradient(90deg, rgba(6, 182, 212, 0.5) 1px, transparent 1px)
          `,
          backgroundSize: "50px 50px",
        }}
      />

      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-slate-950/80 border-b border-slate-800/50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="p-2 rounded-lg hover:bg-slate-800/50 transition-colors text-slate-400 hover:text-white"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div>
              <h1 className="text-xl font-bold text-white">{structureData.protein_name}</h1>
              <p className="text-xs text-slate-500 font-mono">{structureData.model_type}</p>
            </div>
          </div>

          <a
            href={`${API}/example-output/pdb`}
            download
            className="flex items-center gap-2 px-4 py-2 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 rounded-lg text-sm font-medium transition-all border border-cyan-500/20 hover:border-cyan-500/40"
          >
            <Download className="h-4 w-4" />
            Download PDB
          </a>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* Key Metrics */}
        <section>
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">
            Model Confidence Metrics
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard
              label="Mean pLDDT"
              value={metrics.avg_plddt}
              color={getPlddtColor(metrics.avg_plddt)}
              description="Average per-residue confidence score (0-100)"
            />
            <MetricCard
              label="pTM Score"
              value={metrics.ptm}
              color={metrics.ptm > 0.7 ? "#00B4D8" : metrics.ptm > 0.5 ? "#FFB703" : "#FB8500"}
              description="Predicted TM-score for global structure accuracy"
            />
            <MetricCard
              label="Mean PAE"
              value={metrics.mean_pae}
              unit="Å"
              color={metrics.mean_pae < 5 ? "#0A9396" : metrics.mean_pae < 10 ? "#E9D8A6" : "#CA6702"}
              description="Average predicted aligned error"
            />
            <MetricCard
              label="Max pLDDT"
              value={metrics.max_plddt}
              color={getPlddtColor(metrics.max_plddt)}
              description="Highest confidence residue"
            />
          </div>
        </section>

        {/* pLDDT Chart */}
        <section>
          <PlddtChart plddt={plddt} />
        </section>

        {/* PAE Heatmap + Sequence */}
        <section className="grid md:grid-cols-2 gap-6">
          {paeData && <PAEHeatmap paeData={paeData} />}
          <SequenceViewer sequence={metrics.sequence} plddt={plddt} />
        </section>

        {/* Templates */}
        {templates && Object.keys(templates).length > 0 && (
          <section>
            <TemplateList templates={templates} />
          </section>
        )}

        {/* Model Configuration */}
        <section className="bg-slate-800/30 backdrop-blur-sm rounded-2xl p-6 border border-slate-700/30">
          <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">
            Model Configuration
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-slate-500">Model Type</span>
              <p className="font-mono text-white">{structureData.config?.model_type as string || "alphafold2_ptm"}</p>
            </div>
            <div>
              <span className="text-slate-500">Recycles</span>
              <p className="font-mono text-white">{structureData.config?.num_recycles as number || 3}</p>
            </div>
            <div>
              <span className="text-slate-500">MSA Mode</span>
              <p className="font-mono text-white">{structureData.config?.msa_mode as string || "mmseqs2"}</p>
            </div>
            <div>
              <span className="text-slate-500">Templates</span>
              <p className="font-mono text-white">{structureData.config?.use_templates ? "Yes" : "No"}</p>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="text-center text-xs text-slate-600 py-8">
          <p>Powered by AlphaFold2 • ColabFold v{structureData.config?.version as string || "1.5.5"}</p>
        </footer>
      </main>
    </div>
  );
}
