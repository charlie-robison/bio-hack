"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  FlaskConical,
  FileText,
  BarChart3,
  Atom,
  ExternalLink,
} from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

// Types matching backend validation.json structure
interface ClaimValidation {
  claim: string;
  category: string;
  paper_evidence: string;
  models_tested: string[];
  result: "validated" | "partially_validated" | "not_testable" | "invalidated";
  confidence: string;
  evidence: Record<string, unknown>;
  conclusion: string;
}

interface ValidationResult {
  validation_id: string;
  paper_title: string;
  paper_journal?: string;
  paper_run_id?: string;
  models_used: string[];
  overall_reliability_score: number;
  claims_validated: ClaimValidation[];
  aggregate_results: {
    total_claims: number;
    validated: number;
    partially_validated: number;
    not_testable: number;
    invalidated: number;
    validation_rate: number;
    validation_summary: string;
  };
  model_agreement_matrix?: Record<string, unknown>;
  final_verdict: {
    paper_validity: string;
    reliability_score: number;
    summary: string;
    confidence_factors?: string[];
    remaining_gaps?: string[];
  };
}

interface ModelOutput {
  model_slug: string;
  job_id?: string;
  status?: string;
  runtime_seconds?: number;
  complex_prediction?: {
    confidence_score?: number;
    protein_plddt_mean?: number;
    ligand_plddt_mean?: number;
    predicted_ki_nm?: number;
    ligand_rmsd_to_pdb_7t47?: number;
  };
  summary?: {
    verdict?: string;
    mean_ki_nm?: number;
  };
  [key: string]: unknown;
}

function VerdictBadge({ status, score }: { status: string; score: number }) {
  const variant = {
    strongly_supported: "default" as const,
    supported: "default" as const,
    mixed: "secondary" as const,
    weakly_supported: "secondary" as const,
    contradicted: "destructive" as const,
  }[status] || "outline";

  const Icon = {
    strongly_supported: CheckCircle2,
    supported: CheckCircle2,
    mixed: AlertCircle,
    weakly_supported: AlertCircle,
    contradicted: XCircle,
  }[status] || AlertCircle;

  return (
    <Badge variant={variant} className="gap-1.5 px-3 py-1.5 text-sm">
      <Icon className="h-4 w-4" />
      <span className="capitalize">{status.replace(/_/g, " ")}</span>
      <span className="opacity-70">({Math.round(score * 100)}%)</span>
    </Badge>
  );
}

function ClaimResultBadge({ result }: { result: string }) {
  const config = {
    validated: { variant: "default" as const, icon: CheckCircle2, label: "Validated" },
    partially_validated: { variant: "secondary" as const, icon: AlertCircle, label: "Partial" },
    not_testable: { variant: "outline" as const, icon: AlertCircle, label: "Not Testable" },
    invalidated: { variant: "destructive" as const, icon: XCircle, label: "Invalidated" },
  }[result] || { variant: "outline" as const, icon: AlertCircle, label: result };

  return (
    <Badge variant={config.variant} className="gap-1">
      <config.icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
}

function ModelChip({ name }: { name: string }) {
  const colors: Record<string, string> = {
    alphafold: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    esmfold: "bg-indigo-500/10 text-indigo-500 border-indigo-500/20",
    "boltz-2": "bg-purple-500/10 text-purple-500 border-purple-500/20",
    "chai-1": "bg-pink-500/10 text-pink-500 border-pink-500/20",
    diffdock: "bg-amber-500/10 text-amber-500 border-amber-500/20",
    gnina: "bg-orange-500/10 text-orange-500 border-orange-500/20",
    "autodock-vina": "bg-red-500/10 text-red-500 border-red-500/20",
    "openmm-md": "bg-teal-500/10 text-teal-500 border-teal-500/20",
    prodigy: "bg-cyan-500/10 text-cyan-500 border-cyan-500/20",
  };

  return (
    <span className={`text-xs px-2 py-0.5 rounded border ${colors[name] || "bg-muted text-muted-foreground border-border"}`}>
      {name}
    </span>
  );
}

export default function ExperimentResultsPage() {
  const params = useParams();
  const experimentId = params.experimentId as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [outputs, setOutputs] = useState<ModelOutput[]>([]);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);

      try {
        // Fetch validation results
        const valRes = await fetch(`${API}/tamarind/experiments/${experimentId}/validation`);
        if (!valRes.ok) {
          throw new Error(`Experiment not found (${valRes.status})`);
        }
        const valData = await valRes.json();
        setValidation(valData);

        // Fetch outputs list
        const outRes = await fetch(`${API}/tamarind/experiments/${experimentId}/outputs`);
        if (outRes.ok) {
          const outList = await outRes.json();
          // Fetch each output file
          const outputPromises = outList.map(async (item: { file: string }) => {
            const res = await fetch(`${API}/tamarind/experiments/${experimentId}/outputs/${item.file}`);
            if (res.ok) return res.json();
            return null;
          });
          const outputData = await Promise.all(outputPromises);
          setOutputs(outputData.filter(Boolean));
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load experiment");
      } finally {
        setLoading(false);
      }
    }

    if (experimentId) {
      fetchData();
    }
  }, [experimentId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading experiment results...
        </div>
      </div>
    );
  }

  if (error || !validation) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="text-destructive">Error</CardTitle>
            <CardDescription>{error || "Experiment not found"}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/experiments">Back to Experiments</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" asChild>
              <Link href="/experiments">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div className="flex items-center gap-2">
              <FlaskConical className="h-5 w-5 text-primary" />
              <span className="font-semibold">Experiment Results</span>
              <span className="text-xs text-muted-foreground font-mono">{experimentId}</span>
            </div>
          </div>
          <VerdictBadge
            status={validation.final_verdict.paper_validity}
            score={validation.final_verdict.reliability_score}
          />
        </div>
      </header>

      <main className="container py-6 space-y-6">
        {/* Paper Info */}
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <CardDescription className="flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5" />
                  Source Paper
                </CardDescription>
                <CardTitle className="text-xl leading-tight">{validation.paper_title}</CardTitle>
                {validation.paper_journal && (
                  <p className="text-sm text-muted-foreground">{validation.paper_journal}</p>
                )}
              </div>
              <div className="text-right space-y-2">
                <div className="text-4xl font-bold text-primary">
                  {Math.round(validation.overall_reliability_score * 100)}%
                </div>
                <p className="text-xs text-muted-foreground">Reliability Score</p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1.5">
              {validation.models_used.map((model) => (
                <ModelChip key={model} name={model} />
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card>
            <CardContent className="pt-6 text-center">
              <div className="text-2xl font-bold">{validation.aggregate_results.total_claims}</div>
              <p className="text-xs text-muted-foreground">Total Claims</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <div className="text-2xl font-bold text-green-500">{validation.aggregate_results.validated}</div>
              <p className="text-xs text-muted-foreground">Validated</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <div className="text-2xl font-bold text-amber-500">{validation.aggregate_results.partially_validated}</div>
              <p className="text-xs text-muted-foreground">Partial</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <div className="text-2xl font-bold text-muted-foreground">{validation.aggregate_results.not_testable}</div>
              <p className="text-xs text-muted-foreground">Not Testable</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <div className="text-2xl font-bold text-red-500">{validation.aggregate_results.invalidated}</div>
              <p className="text-xs text-muted-foreground">Invalidated</p>
            </CardContent>
          </Card>
        </div>

        {/* Main Tabs */}
        <Tabs defaultValue="claims" className="space-y-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="claims" className="gap-1.5">
              <FileText className="h-4 w-4" />
              Claims
            </TabsTrigger>
            <TabsTrigger value="models" className="gap-1.5">
              <Atom className="h-4 w-4" />
              Model Outputs
            </TabsTrigger>
            <TabsTrigger value="verdict" className="gap-1.5">
              <BarChart3 className="h-4 w-4" />
              Verdict
            </TabsTrigger>
          </TabsList>

          {/* Claims Tab */}
          <TabsContent value="claims" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Claims Validated</CardTitle>
                <CardDescription>{validation.aggregate_results.validation_summary}</CardDescription>
              </CardHeader>
              <CardContent>
                <Accordion type="single" collapsible className="w-full">
                  {validation.claims_validated.map((claim, i) => (
                    <AccordionItem key={i} value={`claim-${i}`}>
                      <AccordionTrigger className="hover:no-underline">
                        <div className="flex items-center gap-3 text-left flex-1">
                          <ClaimResultBadge result={claim.result} />
                          <span className="flex-1 text-sm">{claim.claim}</span>
                          <Badge variant="outline" className="ml-2 capitalize">
                            {claim.category.replace(/_/g, " ")}
                          </Badge>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="pt-2">
                        <div className="rounded-lg border p-4 space-y-4">
                          <div className="grid md:grid-cols-2 gap-4 text-sm">
                            <div>
                              <span className="text-muted-foreground block mb-1">Paper Evidence</span>
                              <p>{claim.paper_evidence}</p>
                            </div>
                            <div>
                              <span className="text-muted-foreground block mb-1">Confidence</span>
                              <Badge variant="outline" className="capitalize">{claim.confidence}</Badge>
                            </div>
                          </div>

                          {claim.models_tested.length > 0 && (
                            <div>
                              <span className="text-sm text-muted-foreground block mb-2">Models Used</span>
                              <div className="flex flex-wrap gap-1.5">
                                {claim.models_tested.map((m) => (
                                  <ModelChip key={m} name={m} />
                                ))}
                              </div>
                            </div>
                          )}

                          {Object.keys(claim.evidence).length > 0 && (
                            <div>
                              <span className="text-sm text-muted-foreground block mb-2">Evidence</span>
                              <div className="bg-muted/50 rounded p-3 font-mono text-xs overflow-x-auto">
                                <pre>{JSON.stringify(claim.evidence, null, 2)}</pre>
                              </div>
                            </div>
                          )}

                          <Separator />
                          <p className="text-sm">{claim.conclusion}</p>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Model Outputs Tab */}
          <TabsContent value="models" className="space-y-4">
            {outputs.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No model outputs available
                </CardContent>
              </Card>
            ) : (
              <div className="grid md:grid-cols-2 gap-4">
                {outputs.map((output, i) => (
                  <Card key={i}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base flex items-center gap-2">
                          <ModelChip name={output.model_slug} />
                        </CardTitle>
                        {output.status && (
                          <Badge variant={output.status === "completed" ? "default" : "secondary"}>
                            {output.status}
                          </Badge>
                        )}
                      </div>
                      {output.runtime_seconds && (
                        <CardDescription>
                          Runtime: {Math.round(output.runtime_seconds / 60)}m
                        </CardDescription>
                      )}
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {output.complex_prediction && (
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          {output.complex_prediction.confidence_score && (
                            <div>
                              <span className="text-muted-foreground">Confidence</span>
                              <p className="font-mono">{(output.complex_prediction.confidence_score * 100).toFixed(1)}%</p>
                            </div>
                          )}
                          {output.complex_prediction.protein_plddt_mean && (
                            <div>
                              <span className="text-muted-foreground">pLDDT</span>
                              <p className="font-mono">{output.complex_prediction.protein_plddt_mean.toFixed(1)}</p>
                            </div>
                          )}
                          {output.complex_prediction.predicted_ki_nm && (
                            <div>
                              <span className="text-muted-foreground">Ki (nM)</span>
                              <p className="font-mono">{output.complex_prediction.predicted_ki_nm.toFixed(2)}</p>
                            </div>
                          )}
                          {output.complex_prediction.ligand_rmsd_to_pdb_7t47 && (
                            <div>
                              <span className="text-muted-foreground">RMSD to Crystal</span>
                              <p className="font-mono">{output.complex_prediction.ligand_rmsd_to_pdb_7t47.toFixed(2)} A</p>
                            </div>
                          )}
                        </div>
                      )}
                      {output.summary?.verdict && (
                        <p className="text-xs text-muted-foreground border-t pt-3">
                          {output.summary.verdict}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Verdict Tab */}
          <TabsContent value="verdict" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Final Verdict</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-start gap-6">
                  <div className="flex-shrink-0 text-center">
                    <div className={`w-24 h-24 rounded-full flex items-center justify-center text-3xl font-bold ${
                      validation.final_verdict.reliability_score >= 0.8 ? "bg-green-500/20 text-green-500" :
                      validation.final_verdict.reliability_score >= 0.6 ? "bg-amber-500/20 text-amber-500" :
                      "bg-red-500/20 text-red-500"
                    }`}>
                      {Math.round(validation.final_verdict.reliability_score * 100)}
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">Reliability</p>
                  </div>
                  <div className="flex-1 space-y-4">
                    <VerdictBadge
                      status={validation.final_verdict.paper_validity}
                      score={validation.final_verdict.reliability_score}
                    />
                    <p className="text-sm">{validation.final_verdict.summary}</p>
                  </div>
                </div>

                {validation.final_verdict.confidence_factors && (
                  <>
                    <Separator />
                    <div>
                      <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        Confidence Factors
                      </h4>
                      <ul className="space-y-1">
                        {validation.final_verdict.confidence_factors.map((factor, i) => (
                          <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                            <span className="text-green-500">+</span>
                            {factor}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </>
                )}

                {validation.final_verdict.remaining_gaps && (
                  <div>
                    <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 text-amber-500" />
                      Remaining Gaps
                    </h4>
                    <ul className="space-y-1">
                      {validation.final_verdict.remaining_gaps.map((gap, i) => (
                        <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                          <span className="text-amber-500">-</span>
                          {gap}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Model Agreement Matrix */}
            {validation.model_agreement_matrix && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Model Agreement</CardTitle>
                  <CardDescription>Cross-model consistency metrics</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="bg-muted/50 rounded p-3 font-mono text-xs overflow-x-auto">
                    <pre>{JSON.stringify(validation.model_agreement_matrix, null, 2)}</pre>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>

        {/* Footer */}
        <Separator />
        <p className="text-center text-xs text-muted-foreground py-4">
          Validation ID: {validation.validation_id}
        </p>
      </main>
    </div>
  );
}
