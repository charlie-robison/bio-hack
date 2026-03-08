"use client";

import { Dna, FlaskConical, TrendingUp, ShieldCheck, Activity, BarChart3 } from "lucide-react";
import type { SyntheticDataRow } from "./types";

interface StatsCardsProps {
  data: SyntheticDataRow[] | null;
  loading: boolean;
}

function SkeletonCard() {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-zinc-200 bg-white px-5 py-4 dark:border-zinc-800 dark:bg-zinc-950 animate-pulse">
      <div className="h-10 w-10 shrink-0 rounded-xl bg-zinc-100 dark:bg-zinc-800" />
      <div className="space-y-2 flex-1">
        <div className="h-5 w-12 rounded bg-zinc-100 dark:bg-zinc-800" />
        <div className="h-3 w-20 rounded bg-zinc-100/80 dark:bg-zinc-800/80" />
      </div>
    </div>
  );
}

export default function StatsCards({ data, loading }: StatsCardsProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  if (!data) return null;

  const uniqueGenes = new Set(data.map((r) => r.gene)).size;
  const significantCount = data.filter((r) => r.pValue < 0.05).length;
  const avgFoldChange =
    data.reduce((sum, r) => sum + Math.abs(r.foldChange), 0) / data.length;
  const upRegulated = data.filter((r) => r.foldChange > 1).length;
  const downRegulated = data.filter((r) => r.foldChange < -1).length;
  const avgExpression = data.reduce((sum, r) => sum + r.expressionLevel, 0) / data.length;

  const stats = [
    {
      label: "Unique Genes",
      value: uniqueGenes.toString(),
      icon: Dna,
      color: "text-violet-600 dark:text-violet-400",
      bg: "bg-violet-50 dark:bg-violet-900/20",
    },
    {
      label: "Significant (p<0.05)",
      value: significantCount.toString(),
      subtitle: `${((significantCount / data.length) * 100).toFixed(0)}% of total`,
      icon: ShieldCheck,
      color: "text-emerald-600 dark:text-emerald-400",
      bg: "bg-emerald-50 dark:bg-emerald-900/20",
    },
    {
      label: "Avg |Fold Change|",
      value: avgFoldChange.toFixed(2),
      icon: TrendingUp,
      color: "text-blue-600 dark:text-blue-400",
      bg: "bg-blue-50 dark:bg-blue-900/20",
    },
    {
      label: "Up-regulated",
      value: upRegulated.toString(),
      subtitle: "FC > 1",
      icon: FlaskConical,
      color: "text-amber-600 dark:text-amber-400",
      bg: "bg-amber-50 dark:bg-amber-900/20",
    },
    {
      label: "Down-regulated",
      value: downRegulated.toString(),
      subtitle: "FC < -1",
      icon: Activity,
      color: "text-rose-600 dark:text-rose-400",
      bg: "bg-rose-50 dark:bg-rose-900/20",
    },
    {
      label: "Avg Expression",
      value: avgExpression.toFixed(0),
      icon: BarChart3,
      color: "text-cyan-600 dark:text-cyan-400",
      bg: "bg-cyan-50 dark:bg-cyan-900/20",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="flex items-center gap-4 rounded-2xl border border-zinc-200 bg-white px-5 py-4 transition-all hover:border-zinc-300 hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700"
        >
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${stat.bg}`}
          >
            <stat.icon className={`h-5 w-5 ${stat.color}`} />
          </div>
          <div className="min-w-0">
            <p className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
              {stat.value}
            </p>
            <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
              {stat.label}
            </p>
            {"subtitle" in stat && stat.subtitle && (
              <p className="truncate text-[10px] text-zinc-400 dark:text-zinc-500">
                {stat.subtitle}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
