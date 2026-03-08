"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  ZAxis,
  Cell,
  ReferenceLine,
  ErrorBar,
  ComposedChart,
  Line,
} from "recharts";
import { useState, useRef, useCallback, useMemo } from "react";
import { Download, Image, BarChart3 } from "lucide-react";
import type { SyntheticDataRow } from "./types";

interface DataChartProps {
  data: SyntheticDataRow[] | null;
  loading: boolean;
}

type ChartView = "bar" | "volcano" | "errorbar";

interface VolcanoPoint {
  x: number;
  y: number;
  gene: string;
  pValue: number;
  significant: boolean;
}

interface ErrorBarData {
  gene: string;
  Treatment: number;
  Control: number;
  treatmentError: number;
  controlError: number;
  treatmentCiLow: number;
  treatmentCiHigh: number;
  controlCiLow: number;
  controlCiHigh: number;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function VolcanoTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null;
  const point: VolcanoPoint = payload[0].payload;
  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
      <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
        {point.gene}
      </p>
      <div className="mt-1.5 space-y-0.5">
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Fold Change:{" "}
          <span className={`font-mono font-medium ${
            point.x > 0 ? "text-rose-600 dark:text-rose-400" : "text-sky-600 dark:text-sky-400"
          }`}>
            {point.x > 0 ? "+" : ""}{point.x.toFixed(3)}
          </span>
        </p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          p-value:{" "}
          <span className={`font-mono font-medium ${
            point.pValue < 0.05 ? "text-emerald-600 dark:text-emerald-400" : "text-zinc-700 dark:text-zinc-300"
          }`}>
            {point.pValue.toExponential(2)}
          </span>
        </p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          -log₁₀(p):{" "}
          <span className="font-mono font-medium text-zinc-700 dark:text-zinc-300">
            {point.y.toFixed(2)}
          </span>
        </p>
      </div>
      {point.significant && (
        <div className="mt-2 flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
          <span className="text-[10px] font-medium uppercase tracking-wider text-rose-600 dark:text-rose-400">
            Significant
          </span>
        </div>
      )}
    </div>
  );
}

function ErrorBarTooltip({ active, payload, label }: any) {
  if (!active || !payload || !payload.length) return null;
  const data = payload[0]?.payload as ErrorBarData;
  if (!data) return null;
  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
      <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{label}</p>
      <div className="mt-1.5 space-y-1">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-sm bg-emerald-400" />
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            Treatment: <span className="font-mono font-medium text-zinc-700 dark:text-zinc-300">{data.Treatment.toFixed(1)}</span>
            <span className="text-[10px] text-zinc-400 dark:text-zinc-500"> ± {data.treatmentError.toFixed(1)}</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-sm bg-violet-400" />
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            Control: <span className="font-mono font-medium text-zinc-700 dark:text-zinc-300">{data.Control.toFixed(1)}</span>
            <span className="text-[10px] text-zinc-400 dark:text-zinc-500"> ± {data.controlError.toFixed(1)}</span>
          </span>
        </div>
        <div className="mt-1 border-t border-zinc-100 pt-1 dark:border-zinc-800">
          <p className="text-[10px] text-zinc-400 dark:text-zinc-500">95% CI shown as error bars</p>
        </div>
      </div>
    </div>
  );
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function ChartSkeleton() {
  return (
    <div className="w-full overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950 animate-pulse">
      <div className="flex items-center justify-between border-b border-zinc-100 px-6 py-4 dark:border-zinc-800/80">
        <div className="space-y-2">
          <div className="h-4 w-40 rounded bg-zinc-100 dark:bg-zinc-800" />
          <div className="h-3 w-56 rounded bg-zinc-100/80 dark:bg-zinc-800/60" />
        </div>
        <div className="h-8 w-44 rounded-lg bg-zinc-100 dark:bg-zinc-800" />
      </div>
      <div className="p-6">
        <div className="flex h-[360px] items-end gap-3 px-8 pb-8">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="flex flex-1 flex-col items-center gap-1">
              <div
                className="w-full rounded-t bg-zinc-100 dark:bg-zinc-800"
                style={{ height: `${30 + Math.random() * 60}%` }}
              />
              <div className="h-2.5 w-8 rounded bg-zinc-100/60 dark:bg-zinc-800/60" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function DataChart({ data, loading }: DataChartProps) {
  const [view, setView] = useState<ChartView>("volcano");
  const [showCI, setShowCI] = useState(true);
  const chartRef = useRef<HTMLDivElement>(null);

  const handleExportPNG = useCallback(() => {
    if (!chartRef.current) return;
    const svgElement = chartRef.current.querySelector("svg");
    if (!svgElement) return;

    const svgData = new XMLSerializer().serializeToString(svgElement);
    const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new window.Image();

    img.onload = () => {
      canvas.width = img.width * 2;
      canvas.height = img.height * 2;
      if (ctx) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.scale(2, 2);
        ctx.drawImage(img, 0, 0);
      }
      const pngUrl = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = pngUrl;
      a.download = `biohack_${view}_chart.png`;
      a.click();
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }, [view]);

  const handleExportSVG = useCallback(() => {
    if (!chartRef.current) return;
    const svgElement = chartRef.current.querySelector("svg");
    if (!svgElement) return;

    const svgData = new XMLSerializer().serializeToString(svgElement);
    const blob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `biohack_${view}_chart.svg`;
    a.click();
    URL.revokeObjectURL(url);
  }, [view]);

  const { barChartData, errorBarChartData, volcanoData, significantPoints, nonsignificantPoints } = useMemo(() => {
    if (!data) return { barChartData: [], errorBarChartData: [], volcanoData: [], significantPoints: [], nonsignificantPoints: [] };

    const barData = data.reduce<
      Record<string, { gene: string; Treatment: number; Control: number }>
    >((acc, row) => {
      if (!acc[row.gene]) {
        acc[row.gene] = { gene: row.gene, Treatment: 0, Control: 0 };
      }
      acc[row.gene][row.condition] += row.expressionLevel;
      return acc;
    }, {});
    const barChartData = Object.values(barData);

    // Build error bar data grouped by gene
    const geneGroups: Record<string, { treatment: SyntheticDataRow[]; control: SyntheticDataRow[] }> = {};
    data.forEach((row) => {
      if (!geneGroups[row.gene]) geneGroups[row.gene] = { treatment: [], control: [] };
      if (row.condition === "Treatment") geneGroups[row.gene].treatment.push(row);
      else geneGroups[row.gene].control.push(row);
    });

    const errorBarChartData: ErrorBarData[] = Object.entries(geneGroups).map(([gene, group]) => {
      const treatmentMean = group.treatment.length > 0
        ? group.treatment.reduce((s, r) => s + r.expressionLevel, 0) / group.treatment.length
        : 0;
      const controlMean = group.control.length > 0
        ? group.control.reduce((s, r) => s + r.expressionLevel, 0) / group.control.length
        : 0;
      const treatmentSE = group.treatment.length > 0
        ? group.treatment.reduce((s, r) => s + r.stdError, 0) / group.treatment.length
        : 0;
      const controlSE = group.control.length > 0
        ? group.control.reduce((s, r) => s + r.stdError, 0) / group.control.length
        : 0;

      return {
        gene,
        Treatment: Math.round(treatmentMean * 10) / 10,
        Control: Math.round(controlMean * 10) / 10,
        treatmentError: Math.round(treatmentSE * 1.96 * 10) / 10,
        controlError: Math.round(controlSE * 1.96 * 10) / 10,
        treatmentCiLow: Math.round((treatmentMean - treatmentSE * 1.96) * 10) / 10,
        treatmentCiHigh: Math.round((treatmentMean + treatmentSE * 1.96) * 10) / 10,
        controlCiLow: Math.round((controlMean - controlSE * 1.96) * 10) / 10,
        controlCiHigh: Math.round((controlMean + controlSE * 1.96) * 10) / 10,
      };
    });

    const vData: VolcanoPoint[] = data.map((row) => ({
      x: row.foldChange,
      y: -Math.log10(Math.max(row.pValue, 1e-300)),
      gene: row.gene,
      pValue: row.pValue,
      significant: row.pValue < 0.05 && Math.abs(row.foldChange) > 1,
    }));

    return {
      barChartData,
      errorBarChartData,
      volcanoData: vData,
      significantPoints: vData.filter((d) => d.significant),
      nonsignificantPoints: vData.filter((d) => !d.significant),
    };
  }, [data]);

  if (loading) return <ChartSkeleton />;
  if (!data) return null;

  const viewTitles: Record<ChartView, { title: string; subtitle: string }> = {
    volcano: {
      title: "Volcano Plot",
      subtitle: "Hover over points for gene details. Significant genes colored (p<0.05, |FC|>1).",
    },
    bar: {
      title: "Gene Expression by Condition",
      subtitle: "Comparing treatment vs control expression levels",
    },
    errorbar: {
      title: "Expression with 95% Confidence Intervals",
      subtitle: "Mean expression levels with error bars showing 95% CI",
    },
  };

  return (
    <div className="w-full overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-col gap-3 border-b border-zinc-100 px-6 py-4 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-800/80">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {viewTitles[view].title}
          </h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {viewTitles[view].subtitle}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Chart type toggle */}
          <div className="flex gap-0.5 rounded-lg bg-zinc-100 p-0.5 dark:bg-zinc-800">
            <button
              onClick={() => setView("volcano")}
              className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-all cursor-pointer ${
                view === "volcano"
                  ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"
              }`}
            >
              Volcano
            </button>
            <button
              onClick={() => setView("bar")}
              className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-all cursor-pointer ${
                view === "bar"
                  ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"
              }`}
            >
              Bar
            </button>
            <button
              onClick={() => setView("errorbar")}
              className={`flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-all cursor-pointer ${
                view === "errorbar"
                  ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"
              }`}
            >
              <BarChart3 className="h-3 w-3" />
              CI
            </button>
          </div>

          {/* CI toggle for error bar view */}
          {view === "errorbar" && (
            <button
              onClick={() => setShowCI(!showCI)}
              className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-all cursor-pointer border ${
                showCI
                  ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-600/40 dark:bg-emerald-900/20 dark:text-emerald-400"
                  : "border-zinc-200 bg-white text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400"
              }`}
            >
              {showCI ? "CI: On" : "CI: Off"}
            </button>
          )}

          {/* Export dropdown */}
          <div className="relative group">
            <button className="flex items-center gap-1.5 rounded-lg bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 cursor-pointer">
              <Download className="h-3.5 w-3.5" />
              Export
            </button>
            <div className="invisible absolute right-0 top-full z-20 mt-1 w-36 rounded-xl border border-zinc-200 bg-white p-1 shadow-lg transition-all group-hover:visible dark:border-zinc-700 dark:bg-zinc-900">
              <button
                onClick={handleExportPNG}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800 cursor-pointer"
              >
                <Image className="h-3.5 w-3.5" />
                Export PNG
              </button>
              <button
                onClick={handleExportSVG}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800 cursor-pointer"
              >
                <Download className="h-3.5 w-3.5" />
                Export SVG
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="p-6" ref={chartRef}>
        <ResponsiveContainer width="100%" height={400}>
          {view === "errorbar" ? (
            <ComposedChart
              data={errorBarChartData}
              margin={{ top: 8, right: 8, bottom: 8, left: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" vertical={false} />
              <XAxis
                dataKey="gene"
                tick={{ fontSize: 11, fill: "#71717a" }}
                axisLine={false}
                tickLine={false}
                angle={-45}
                textAnchor="end"
                height={60}
              />
              <YAxis
                tick={{ fontSize: 12, fill: "#71717a" }}
                axisLine={false}
                tickLine={false}
                label={{
                  value: "Expression Level",
                  angle: -90,
                  position: "insideLeft",
                  offset: 10,
                  style: { fontSize: 11, fill: "#a1a1aa" },
                }}
              />
              <Tooltip content={<ErrorBarTooltip />} />
              <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "16px" }} />
              <Bar dataKey="Treatment" fill="#34d399" radius={[6, 6, 0, 0]} maxBarSize={32} opacity={0.9}>
                {showCI && <ErrorBar dataKey="treatmentError" width={4} strokeWidth={1.5} stroke="#059669" />}
              </Bar>
              <Bar dataKey="Control" fill="#a78bfa" radius={[6, 6, 0, 0]} maxBarSize={32} opacity={0.9}>
                {showCI && <ErrorBar dataKey="controlError" width={4} strokeWidth={1.5} stroke="#7c3aed" />}
              </Bar>
              {/* Mean reference line */}
              <Line
                dataKey="Treatment"
                stroke="transparent"
                dot={false}
                activeDot={false}
                legendType="none"
              />
            </ComposedChart>
          ) : view === "bar" ? (
            <BarChart
              data={barChartData}
              margin={{ top: 8, right: 8, bottom: 8, left: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#e4e4e7"
                vertical={false}
              />
              <XAxis
                dataKey="gene"
                tick={{ fontSize: 11, fill: "#71717a" }}
                axisLine={false}
                tickLine={false}
                angle={-45}
                textAnchor="end"
                height={60}
              />
              <YAxis
                tick={{ fontSize: 12, fill: "#71717a" }}
                axisLine={false}
                tickLine={false}
                label={{
                  value: "Expression Level",
                  angle: -90,
                  position: "insideLeft",
                  offset: 10,
                  style: { fontSize: 11, fill: "#a1a1aa" },
                }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#fafafa",
                  border: "1px solid #e4e4e7",
                  borderRadius: "12px",
                  fontSize: "12px",
                  boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)",
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: "12px", paddingTop: "16px" }}
              />
              <Bar
                dataKey="Treatment"
                fill="#34d399"
                radius={[6, 6, 0, 0]}
                maxBarSize={40}
              />
              <Bar
                dataKey="Control"
                fill="#a78bfa"
                radius={[6, 6, 0, 0]}
                maxBarSize={40}
              />
            </BarChart>
          ) : (
            <ScatterChart margin={{ top: 8, right: 24, bottom: 16, left: 8 }}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#e4e4e7"
                vertical={false}
              />
              <XAxis
                dataKey="x"
                name="Fold Change"
                type="number"
                tick={{ fontSize: 12, fill: "#71717a" }}
                axisLine={false}
                tickLine={false}
                label={{
                  value: "log₂ Fold Change",
                  position: "bottom",
                  offset: 0,
                  style: { fontSize: 11, fill: "#a1a1aa" },
                }}
              />
              <YAxis
                dataKey="y"
                name="-log10(p)"
                type="number"
                tick={{ fontSize: 12, fill: "#71717a" }}
                axisLine={false}
                tickLine={false}
                label={{
                  value: "-log₁₀(p-value)",
                  angle: -90,
                  position: "insideLeft",
                  offset: 10,
                  style: { fontSize: 11, fill: "#a1a1aa" },
                }}
              />
              <ZAxis range={[48, 48]} />
              <ReferenceLine
                y={-Math.log10(0.05)}
                stroke="#a1a1aa"
                strokeDasharray="6 3"
                strokeWidth={1}
                label={{
                  value: "p=0.05",
                  position: "right",
                  style: { fontSize: 10, fill: "#a1a1aa" },
                }}
              />
              <ReferenceLine
                x={-1}
                stroke="#a1a1aa"
                strokeDasharray="6 3"
                strokeWidth={1}
              />
              <ReferenceLine
                x={1}
                stroke="#a1a1aa"
                strokeDasharray="6 3"
                strokeWidth={1}
              />
              <Tooltip
                content={<VolcanoTooltip />}
                cursor={{ strokeDasharray: "3 3", stroke: "#a1a1aa" }}
              />
              <Legend
                wrapperStyle={{ fontSize: "12px", paddingTop: "12px" }}
              />
              <Scatter
                data={significantPoints}
                name="Significant"
                opacity={0.85}
              >
                {significantPoints.map((point, i) => (
                  <Cell
                    key={i}
                    fill={point.x > 0 ? "#f43f5e" : "#0ea5e9"}
                  />
                ))}
              </Scatter>
              <Scatter
                data={nonsignificantPoints}
                fill="#d4d4d8"
                name="Not significant"
                opacity={0.45}
              />
            </ScatterChart>
          )}
        </ResponsiveContainer>

        {/* Legend explanations */}
        {view === "volcano" && (
          <div className="mt-3 flex flex-wrap items-center justify-center gap-4 text-[11px] text-zinc-500 dark:text-zinc-400">
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
              Upregulated (significant)
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-sky-500" />
              Downregulated (significant)
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-zinc-300" />
              Not significant
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-px w-4 border-t border-dashed border-zinc-400" />
              Threshold lines
            </div>
          </div>
        )}
        {view === "errorbar" && (
          <div className="mt-3 flex flex-wrap items-center justify-center gap-4 text-[11px] text-zinc-500 dark:text-zinc-400">
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-emerald-400" />
              Treatment (mean)
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-violet-400" />
              Control (mean)
            </div>
            {showCI && (
              <div className="flex items-center gap-1.5">
                <span className="h-3 w-px bg-zinc-700" />
                <span className="h-px w-2 bg-zinc-700" />
                95% Confidence Interval
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
