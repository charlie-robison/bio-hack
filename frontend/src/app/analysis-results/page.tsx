"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink, CheckCircle2, XCircle, AlertCircle, FlaskConical, Atom, FileText, BarChart3, ChevronDown } from "lucide-react";

import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { MOCK_ANALYSIS, type AnalysisResult, type BindingPrediction } from "@/components/analysis/types";

function VerdictBadge({ status, score }: { status: string; score: number }) {
  const colors = {
    verified: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
    suspicious: "bg-amber-500/15 text-amber-400 border-amber-500/20",
    debunked: "bg-red-500/15 text-red-400 border-red-500/20",
    inconclusive: "bg-neutral-500/15 text-neutral-400 border-neutral-500/20",
  };

  const Icon = {
    verified: CheckCircle2,
    suspicious: AlertCircle,
    debunked: XCircle,
    inconclusive: AlertCircle,
  }[status] || AlertCircle;

  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium ${colors[status as keyof typeof colors]}`}>
      <Icon className="h-4 w-4" />
      <span className="capitalize">{status}</span>
      <span className="opacity-60">{score}%</span>
    </div>
  );
}

function PlddtChart({ plddt }: { plddt: number[] }) {
  const getColor = (val: number) => {
    if (val > 90) return "bg-[#2EBDC9]";
    if (val > 70) return "bg-cyan-400";
    if (val > 50) return "bg-amber-400";
    return "bg-red-400";
  };

  return (
    <div className="bg-neutral-900 rounded-xl border border-white/[0.06] p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-[15px] font-semibold text-white">pLDDT Confidence</h3>
          <p className="text-sm text-neutral-500 mt-0.5">Per-residue scores</p>
        </div>
        <div className="flex items-center gap-3 text-xs text-neutral-500">
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-[#2EBDC9]" />&gt;90</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-cyan-400" />70-90</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-amber-400" />50-70</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-red-400" />&lt;50</span>
        </div>
      </div>
      <div className="flex items-end gap-px h-20">
        {plddt.map((val, i) => (
          <div
            key={i}
            className={`flex-1 min-w-[2px] rounded-t-sm ${getColor(val)} opacity-90 hover:opacity-100 transition-opacity`}
            style={{ height: `${val}%` }}
            title={`Residue ${i + 1}: ${val.toFixed(1)}`}
          />
        ))}
      </div>
      <div className="flex justify-between mt-2 text-xs text-neutral-600">
        <span>1</span>
        <span>{plddt.length}</span>
      </div>
    </div>
  );
}

function MoleculeRow({ molecule, prediction, isLead }: {
  molecule: { id: string; name: string; smiles: string; type: string; modification?: string; molWeight?: number };
  prediction?: BindingPrediction;
  isLead?: boolean;
}) {
  const typeColors = {
    lead: "bg-[#2EBDC9]/15 text-[#2EBDC9] border-[#2EBDC9]/20",
    saboteur: "bg-red-500/10 text-red-400 border-red-500/20",
    decoy: "bg-neutral-500/10 text-neutral-400 border-neutral-500/20",
  };

  return (
    <TableRow className={isLead ? "bg-[#2EBDC9]/[0.03]" : ""}>
      <TableCell className="font-medium text-white">{molecule.name}</TableCell>
      <TableCell>
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${typeColors[molecule.type as keyof typeof typeColors]}`}>
          {molecule.type}
        </span>
      </TableCell>
      <TableCell className="font-mono text-xs text-neutral-500 max-w-[200px] truncate">
        {molecule.smiles}
      </TableCell>
      <TableCell className="text-neutral-500 text-sm">
        {molecule.modification || "—"}
      </TableCell>
      <TableCell className="text-right font-mono text-neutral-400">
        {molecule.molWeight?.toFixed(1) || "—"}
      </TableCell>
      <TableCell className="text-right font-mono">
        {prediction ? (
          <span className={isLead ? "text-[#2EBDC9] font-semibold" : "text-neutral-400"}>
            {prediction.predictedAffinity < 1
              ? prediction.predictedAffinity.toExponential(2)
              : prediction.predictedAffinity.toFixed(1)} µM
          </span>
        ) : "—"}
      </TableCell>
      <TableCell className="text-right">
        {prediction && (
          <span className="text-xs text-neutral-500">#{prediction.rank}</span>
        )}
      </TableCell>
    </TableRow>
  );
}

function ClaimItem({ claim, detail, index }: {
  claim: { claim: string; reportedValue: string; unit: string; confidence: number; sourceSection: string };
  detail?: { simulatedValue: string; deviation: number; passes: boolean };
  index: number;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b border-white/[0.04] last:border-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-4 px-5 py-4 hover:bg-white/[0.02] transition-colors text-left"
      >
        {detail ? (
          detail.passes ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-400 flex-shrink-0" />
          ) : (
            <XCircle className="h-5 w-5 text-red-400 flex-shrink-0" />
          )
        ) : (
          <AlertCircle className="h-5 w-5 text-neutral-500 flex-shrink-0" />
        )}
        <span className="text-[15px] text-white font-medium">Claim {index + 1}</span>
        <span className="px-2.5 py-0.5 bg-white/[0.06] rounded text-xs font-mono text-neutral-300">
          {claim.reportedValue} {claim.unit}
        </span>
        <ChevronDown className={`ml-auto h-4 w-4 text-neutral-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="px-5 pb-5 pt-1">
          <div className="bg-neutral-800/50 rounded-lg p-4 space-y-4">
            <p className="text-sm text-neutral-300 leading-relaxed">&ldquo;{claim.claim}&rdquo;</p>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-neutral-500">Reported</span>
                <p className="font-mono text-white mt-1">{claim.reportedValue} {claim.unit}</p>
              </div>
              {detail && (
                <div>
                  <span className="text-neutral-500">Simulated</span>
                  <p className={`font-mono mt-1 ${detail.passes ? "text-emerald-400" : "text-red-400"}`}>
                    {detail.simulatedValue}
                  </p>
                </div>
              )}
              <div>
                <span className="text-neutral-500">Source</span>
                <p className="text-neutral-300 mt-1">{claim.sourceSection}</p>
              </div>
              {detail && (
                <div>
                  <span className="text-neutral-500">Deviation</span>
                  <p className={`font-mono mt-1 ${detail.deviation < 25 ? "text-emerald-400" : detail.deviation < 50 ? "text-amber-400" : "text-red-400"}`}>
                    {detail.deviation.toFixed(1)}%
                  </p>
                </div>
              )}
            </div>
            <div className="pt-2">
              <div className="flex justify-between text-xs text-neutral-500 mb-1.5">
                <span>Extraction confidence</span>
                <span>{(claim.confidence * 100).toFixed(0)}%</span>
              </div>
              <Progress value={claim.confidence * 100} className="h-1" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AnalysisResults() {
  const [analysis] = useState<AnalysisResult>(MOCK_ANALYSIS);

  const getPrediction = (molId: string) =>
    analysis.bindingPredictions.find((p) => p.moleculeId === molId);

  const getClaimDetail = (claimId: string) =>
    analysis.verdict.details.find((d) => d.claimId === claimId);

  const allMolecules = [
    analysis.molecules.lead,
    ...analysis.molecules.saboteurs,
    ...analysis.molecules.decoys,
  ];

  return (
    <div className="min-h-screen bg-neutral-950">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-neutral-950/80 backdrop-blur-xl border-b border-white/[0.06]">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="p-2 -ml-2 rounded-lg hover:bg-white/[0.05] transition-colors">
              <ArrowLeft className="h-4 w-4 text-neutral-400" />
            </Link>
            <div className="flex items-center gap-2.5">
              <div className="h-7 w-7 rounded-lg bg-[#2EBDC9] flex items-center justify-center">
                <FlaskConical className="h-4 w-4 text-neutral-950" />
              </div>
              <span className="text-[15px] font-semibold text-white">BioFact</span>
            </div>
          </div>
          <VerdictBadge status={analysis.verdict.status} score={analysis.verdict.score} />
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        {/* Paper Header */}
        <div className="bg-neutral-900 rounded-xl border border-white/[0.06] p-6">
          <div className="flex items-start justify-between gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-neutral-500">
                <FileText className="h-3.5 w-3.5" />
                Source Paper
              </div>
              <h1 className="text-xl font-semibold text-white leading-tight">{analysis.paper.title}</h1>
              <p className="text-sm text-neutral-500">{analysis.paper.authors.join(", ")}</p>
              {analysis.paper.doi && (
                <a
                  href={`https://doi.org/${analysis.paper.doi}`}
                  target="_blank"
                  rel="noopener"
                  className="inline-flex items-center gap-1 text-xs text-[#2EBDC9] hover:underline"
                >
                  DOI: {analysis.paper.doi}
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
            <div className="flex-shrink-0 bg-neutral-800/50 rounded-lg px-4 py-3 text-center">
              <span className="text-xs text-neutral-500 block mb-1">Target</span>
              <span className="text-lg font-mono font-semibold text-white">
                {analysis.paper.targetProtein}
                {analysis.paper.targetMutation && (
                  <span className="text-[#2EBDC9]"> {analysis.paper.targetMutation}</span>
                )}
              </span>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="claims" className="space-y-4">
          <TabsList className="bg-neutral-900 border border-white/[0.06] p-1 rounded-xl">
            <TabsTrigger value="claims" className="data-[state=active]:bg-white/[0.08] rounded-lg gap-2 text-sm">
              <FileText className="h-4 w-4" />
              Claims
            </TabsTrigger>
            <TabsTrigger value="structure" className="data-[state=active]:bg-white/[0.08] rounded-lg gap-2 text-sm">
              <Atom className="h-4 w-4" />
              Structure
            </TabsTrigger>
            <TabsTrigger value="molecules" className="data-[state=active]:bg-white/[0.08] rounded-lg gap-2 text-sm">
              <FlaskConical className="h-4 w-4" />
              Molecules
            </TabsTrigger>
            <TabsTrigger value="results" className="data-[state=active]:bg-white/[0.08] rounded-lg gap-2 text-sm">
              <BarChart3 className="h-4 w-4" />
              Results
            </TabsTrigger>
          </TabsList>

          {/* Claims */}
          <TabsContent value="claims">
            <div className="bg-neutral-900 rounded-xl border border-white/[0.06] overflow-hidden">
              <div className="px-5 py-4 border-b border-white/[0.06]">
                <h2 className="text-[15px] font-semibold text-white">Extracted Claims</h2>
                <p className="text-sm text-neutral-500 mt-0.5">Claims identified by Claude from the source paper</p>
              </div>
              <div>
                {analysis.paper.claims.map((claim, i) => (
                  <ClaimItem key={claim.id} claim={claim} detail={getClaimDetail(claim.id)} index={i} />
                ))}
              </div>
            </div>
          </TabsContent>

          {/* Structure */}
          <TabsContent value="structure" className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              {analysis.structurePrediction && (
                <>
                  <PlddtChart plddt={analysis.structurePrediction.plddt} />
                  <div className="bg-neutral-900 rounded-xl border border-white/[0.06] p-5">
                    <h3 className="text-[15px] font-semibold text-white mb-4">Model Details</h3>
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <span className="text-xs text-neutral-500">Model Type</span>
                          <p className="font-mono text-sm text-white mt-1">{analysis.structurePrediction.modelType}</p>
                        </div>
                        <div>
                          <span className="text-xs text-neutral-500">Mean pLDDT</span>
                          <p className={`font-mono text-sm font-semibold mt-1 ${analysis.structurePrediction.meanPlddt > 80 ? "text-[#2EBDC9]" : "text-amber-400"}`}>
                            {analysis.structurePrediction.meanPlddt.toFixed(1)}
                          </p>
                        </div>
                        <div>
                          <span className="text-xs text-neutral-500">Max PAE</span>
                          <p className="font-mono text-sm text-white mt-1">{analysis.structurePrediction.maxPae.toFixed(1)} Å</p>
                        </div>
                        <div>
                          <span className="text-xs text-neutral-500">Residues</span>
                          <p className="font-mono text-sm text-white mt-1">{analysis.structurePrediction.plddt.length}</p>
                        </div>
                      </div>
                      <Separator className="bg-white/[0.06]" />
                      <div>
                        <span className="text-xs text-neutral-500">Template PDBs</span>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {analysis.structurePrediction.templatePdbs.slice(0, 5).map((pdb) => (
                            <a
                              key={pdb}
                              href={`https://www.rcsb.org/structure/${pdb.split("_")[0]}`}
                              target="_blank"
                              rel="noopener"
                              className="inline-flex items-center gap-1 px-2.5 py-1 bg-white/[0.05] hover:bg-white/[0.08] rounded-md text-xs font-mono text-neutral-300 transition-colors"
                            >
                              {pdb}
                              <ExternalLink className="h-3 w-3 opacity-50" />
                            </a>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </TabsContent>

          {/* Molecules */}
          <TabsContent value="molecules">
            <div className="bg-neutral-900 rounded-xl border border-white/[0.06] overflow-hidden">
              <div className="px-5 py-4 border-b border-white/[0.06]">
                <h2 className="text-[15px] font-semibold text-white">Molecule Comparison</h2>
                <p className="text-sm text-neutral-500 mt-0.5">Lead compound vs. saboteurs and decoys</p>
              </div>
              <Table>
                <TableHeader>
                  <TableRow className="border-white/[0.06] hover:bg-transparent">
                    <TableHead className="text-neutral-500">Name</TableHead>
                    <TableHead className="text-neutral-500">Type</TableHead>
                    <TableHead className="text-neutral-500">SMILES</TableHead>
                    <TableHead className="text-neutral-500">Modification</TableHead>
                    <TableHead className="text-neutral-500 text-right">MW</TableHead>
                    <TableHead className="text-neutral-500 text-right">Affinity</TableHead>
                    <TableHead className="text-neutral-500 text-right">Rank</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allMolecules.map((mol) => (
                    <MoleculeRow
                      key={mol.id}
                      molecule={mol}
                      prediction={getPrediction(mol.id)}
                      isLead={mol.type === "lead"}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {/* Results */}
          <TabsContent value="results" className="space-y-4">
            <div className="bg-neutral-900 rounded-xl border border-white/[0.06] p-5">
              <h3 className="text-[15px] font-semibold text-white mb-4">Binding Affinity Rankings</h3>
              <p className="text-sm text-neutral-500 mb-5">Lower values = stronger binding (log scale)</p>
              <div className="space-y-2.5">
                {[...analysis.bindingPredictions]
                  .sort((a, b) => a.predictedAffinity - b.predictedAffinity)
                  .map((pred) => {
                    const maxLog = Math.log10(Math.max(...analysis.bindingPredictions.map(p => p.predictedAffinity)) + 1);
                    const logVal = Math.log10(pred.predictedAffinity + 0.0001);
                    const width = Math.max(5, Math.min(100, ((logVal + 4) / (maxLog + 4)) * 100));

                    return (
                      <div key={pred.moleculeId} className="flex items-center gap-3">
                        <span className="w-24 text-sm text-neutral-400 truncate">{pred.moleculeName}</span>
                        <div className="flex-1 h-7 bg-neutral-800 rounded overflow-hidden relative">
                          <div
                            className={`h-full transition-all ${
                              pred.moleculeType === "lead" ? "bg-[#2EBDC9]" :
                              pred.moleculeType === "saboteur" ? "bg-red-500/80" :
                              "bg-neutral-600"
                            }`}
                            style={{ width: `${width}%` }}
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono text-neutral-300">
                            {pred.predictedAffinity < 1
                              ? pred.predictedAffinity.toExponential(2)
                              : pred.predictedAffinity.toFixed(1)} µM
                          </span>
                        </div>
                        <span className="text-xs text-neutral-500 w-8">#{pred.rank}</span>
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* Final Verdict */}
            <div className="bg-neutral-900 rounded-xl border border-white/[0.06] p-5">
              <h3 className="text-[15px] font-semibold text-white mb-5">Final Verdict</h3>
              <div className="flex items-start gap-6">
                <div className="flex-shrink-0 text-center">
                  <div className={`w-20 h-20 rounded-2xl flex items-center justify-center text-3xl font-bold ${
                    analysis.verdict.status === "verified" ? "bg-emerald-500/15 text-emerald-400" :
                    analysis.verdict.status === "suspicious" ? "bg-amber-500/15 text-amber-400" :
                    analysis.verdict.status === "debunked" ? "bg-red-500/15 text-red-400" :
                    "bg-neutral-800 text-neutral-400"
                  }`}>
                    {analysis.verdict.score}
                  </div>
                  <p className="text-xs text-neutral-500 mt-2">Score</p>
                </div>
                <div className="flex-1 space-y-4">
                  <VerdictBadge status={analysis.verdict.status} score={analysis.verdict.score} />
                  <p className="text-sm text-neutral-400 leading-relaxed">{analysis.verdict.explanation}</p>
                  <Separator className="bg-white/[0.06]" />
                  <div className="space-y-2">
                    {analysis.verdict.details.map((detail) => (
                      <div key={detail.claimId} className="flex items-center gap-2.5 text-sm">
                        {detail.passes ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-400" />
                        )}
                        <span className="text-neutral-400">{detail.claimText}</span>
                        <span className="text-neutral-600">→</span>
                        <span className={`font-mono ${detail.passes ? "text-emerald-400" : "text-red-400"}`}>
                          {detail.deviation.toFixed(1)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {/* Footer */}
        <div className="text-center text-xs text-neutral-600 py-6">
          Analysis ID: {analysis.id} • {new Date(analysis.createdAt).toLocaleString()}
        </div>
      </main>
    </div>
  );
}
