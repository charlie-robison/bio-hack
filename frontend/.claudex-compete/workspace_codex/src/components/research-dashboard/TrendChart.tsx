"use client";

import { useMemo, useState } from "react";
import { TIME_POINTS, type MarkerStatus, type SyntheticMarkerRow } from "./types";

interface TrendChartProps {
  rows: SyntheticMarkerRow[];
  isLoading: boolean;
}

type ChartView = "trajectory" | "volcano";

const CHART_WIDTH = 760;
const CHART_HEIGHT = 330;
const MARGIN = {
  top: 20,
  right: 24,
  bottom: 54,
  left: 56,
};

const STATUS_COLOR: Record<MarkerStatus, string> = {
  Upregulated: "#059669",
  Downregulated: "#e11d48",
  Stable: "#475569",
};

const average = (values: number[]) => {
  if (!values.length) {
    return 0;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
};

const buildTicks = (min: number, max: number, count: number) => {
  if (count < 2) {
    return [min];
  }

  const step = (max - min) / (count - 1);
  return Array.from({ length: count }).map((_, index) => min + index * step);
};

const makeScale = (domainMin: number, domainMax: number, rangeMin: number, rangeMax: number) => {
  const span = domainMax - domainMin || 1;
  const range = rangeMax - rangeMin;

  return (value: number) => {
    return rangeMin + ((value - domainMin) / span) * range;
  };
};

const linePath = (values: number[], getX: (index: number) => number, getY: (value: number) => number) => {
  return values
    .map((value, index) => {
      const command = index === 0 ? "M" : "L";
      return `${command} ${getX(index)} ${getY(value)}`;
    })
    .join(" ");
};

const areaPath = (values: number[], getX: (index: number) => number, getY: (value: number) => number, baseline: number) => {
  if (!values.length) {
    return "";
  }

  const topLine = values
    .map((value, index) => `${index === 0 ? "M" : "L"} ${getX(index)} ${getY(value)}`)
    .join(" ");
  const firstX = getX(0);
  const lastX = getX(values.length - 1);

  return `${topLine} L ${lastX} ${baseline} L ${firstX} ${baseline} Z`;
};

const formatPValue = (value: number) => {
  if (value < 0.001) {
    return value.toExponential(2);
  }

  return value.toFixed(4);
};

export function TrendChart({ rows, isLoading }: TrendChartProps) {
  const [activeView, setActiveView] = useState<ChartView>("trajectory");
  const hasData = rows.length > 0;
  const strongestMarker = hasData
    ? rows.reduce<SyntheticMarkerRow>((top, row) => {
        if (Math.abs(row.log2FoldChange) > Math.abs(top.log2FoldChange)) {
          return row;
        }

        return top;
      }, rows[0])
    : null;
  const mostSignificantMarker = hasData
    ? rows.reduce<SyntheticMarkerRow>((top, row) => {
        if (row.pValue < top.pValue) {
          return row;
        }

        return top;
      }, rows[0])
    : null;
  const meanAbsEffect = hasData
    ? average(rows.map((row) => Math.abs(row.log2FoldChange)))
    : 0;

  const trajectory = useMemo(() => {
    return TIME_POINTS.map((point, index) => {
      return {
        point,
        control: average(rows.map((row) => row.controlSeries[index])),
        treated: average(rows.map((row) => row.treatedSeries[index])),
      };
    });
  }, [rows]);

  const trajectoryValues = trajectory.flatMap((entry) => [entry.control, entry.treated]);
  const trajectoryMin = hasData ? Math.max(0, Math.floor(Math.min(...trajectoryValues) - 5)) : 0;
  const trajectoryMax = hasData ? Math.ceil(Math.max(...trajectoryValues) + 5) : 100;

  const trajectoryX = makeScale(0, Math.max(1, TIME_POINTS.length - 1), MARGIN.left, CHART_WIDTH - MARGIN.right);
  const trajectoryY = makeScale(trajectoryMin, trajectoryMax, CHART_HEIGHT - MARGIN.bottom, MARGIN.top);

  const maxAbsEffect = hasData
    ? Math.max(1, ...rows.map((row) => Math.abs(row.log2FoldChange)))
    : 1;
  const volcanoXMin = -Math.ceil((maxAbsEffect + 0.25) * 10) / 10;
  const volcanoXMax = -volcanoXMin;
  const volcanoYMax = hasData
    ? Math.max(2.3, Math.ceil((Math.max(...rows.map((row) => row.negLog10PValue)) + 0.4) * 10) / 10)
    : 2.3;
  const volcanoX = makeScale(volcanoXMin, volcanoXMax, MARGIN.left, CHART_WIDTH - MARGIN.right);
  const volcanoY = makeScale(0, volcanoYMax, CHART_HEIGHT - MARGIN.bottom, MARGIN.top);
  const volcanoXTicks = buildTicks(volcanoXMin, volcanoXMax, 5);
  const volcanoYTicks = buildTicks(0, volcanoYMax, 5);
  const significanceThresholdY = -Math.log10(0.05);
  const effectThresholdX = 0.26;

  return (
    <section className="panel-card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            Visual analysis
          </p>
          <h3 className="mt-1 text-xl font-semibold text-slate-900">
            Trajectory and volcano explorer
          </h3>
        </div>
        <div
          className="flex rounded-xl border border-slate-200 bg-white p-1"
          role="tablist"
          aria-label="Chart view selector"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeView === "trajectory"}
            onClick={() => setActiveView("trajectory")}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] transition ${
              activeView === "trajectory"
                ? "bg-slate-900 text-white"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            Trajectory
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeView === "volcano"}
            onClick={() => setActiveView("volcano")}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] transition ${
              activeView === "volcano"
                ? "bg-slate-900 text-white"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            Volcano
          </button>
        </div>
      </div>

      <div className="mt-5 overflow-x-auto">
        <div className="min-w-[680px]">
          {isLoading ? (
            <div className="h-[340px] animate-pulse rounded-2xl border border-slate-200 bg-slate-100" />
          ) : hasData ? (
            <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} aria-label="Synthetic marker chart">
              <defs>
                <linearGradient id="treatedArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity="0.28" />
                  <stop offset="100%" stopColor="#10b981" stopOpacity="0.02" />
                </linearGradient>
              </defs>

              {activeView === "trajectory" ? (
                <>
                  {buildTicks(trajectoryMin, trajectoryMax, 5).map((tick) => {
                    const y = trajectoryY(tick);
                    return (
                      <g key={`traj-grid-${tick}`}>
                        <line
                          x1={MARGIN.left}
                          y1={y}
                          x2={CHART_WIDTH - MARGIN.right}
                          y2={y}
                          stroke="rgb(148 163 184 / 0.28)"
                        />
                        <text x={MARGIN.left - 10} y={y + 4} textAnchor="end" fontSize="11" fill="#475569">
                          {tick.toFixed(0)}
                        </text>
                      </g>
                    );
                  })}

                  {TIME_POINTS.map((timePoint, index) => {
                    const x = trajectoryX(index);
                    return (
                      <g key={timePoint}>
                        <line
                          x1={x}
                          y1={MARGIN.top}
                          x2={x}
                          y2={CHART_HEIGHT - MARGIN.bottom}
                          stroke="rgb(148 163 184 / 0.16)"
                        />
                        <text x={x} y={CHART_HEIGHT - 18} textAnchor="middle" fontSize="11" fill="#475569">
                          {timePoint}
                        </text>
                      </g>
                    );
                  })}

                  <path
                    d={areaPath(
                      trajectory.map((entry) => entry.treated),
                      trajectoryX,
                      trajectoryY,
                      CHART_HEIGHT - MARGIN.bottom,
                    )}
                    fill="url(#treatedArea)"
                  />

                  <path
                    d={linePath(
                      trajectory.map((entry) => entry.control),
                      trajectoryX,
                      trajectoryY,
                    )}
                    fill="none"
                    stroke="#0ea5e9"
                    strokeWidth={3}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d={linePath(
                      trajectory.map((entry) => entry.treated),
                      trajectoryX,
                      trajectoryY,
                    )}
                    fill="none"
                    stroke="#10b981"
                    strokeWidth={3}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />

                  {trajectory.map((entry, index) => {
                    const x = trajectoryX(index);
                    return (
                      <g key={`traj-point-${entry.point}`}>
                        <circle cx={x} cy={trajectoryY(entry.control)} r={4} fill="#0ea5e9" stroke="white" strokeWidth={2} />
                        <circle cx={x} cy={trajectoryY(entry.treated)} r={4} fill="#10b981" stroke="white" strokeWidth={2} />
                      </g>
                    );
                  })}

                  <text x={CHART_WIDTH / 2} y={CHART_HEIGHT - 3} textAnchor="middle" fontSize="12" fill="#475569">
                    Timepoint
                  </text>
                  <text
                    x={18}
                    y={CHART_HEIGHT / 2}
                    textAnchor="middle"
                    transform={`rotate(-90 18 ${CHART_HEIGHT / 2})`}
                    fontSize="12"
                    fill="#475569"
                  >
                    Mean expression
                  </text>
                </>
              ) : (
                <>
                  {volcanoYTicks.map((tick) => {
                    const y = volcanoY(tick);
                    return (
                      <g key={`volcano-y-${tick.toFixed(2)}`}>
                        <line
                          x1={MARGIN.left}
                          y1={y}
                          x2={CHART_WIDTH - MARGIN.right}
                          y2={y}
                          stroke="rgb(148 163 184 / 0.28)"
                        />
                        <text x={MARGIN.left - 10} y={y + 4} textAnchor="end" fontSize="11" fill="#475569">
                          {tick.toFixed(1)}
                        </text>
                      </g>
                    );
                  })}

                  {volcanoXTicks.map((tick) => {
                    const x = volcanoX(tick);
                    return (
                      <g key={`volcano-x-${tick.toFixed(2)}`}>
                        <line
                          x1={x}
                          y1={MARGIN.top}
                          x2={x}
                          y2={CHART_HEIGHT - MARGIN.bottom}
                          stroke="rgb(148 163 184 / 0.2)"
                        />
                        <text x={x} y={CHART_HEIGHT - 18} textAnchor="middle" fontSize="11" fill="#475569">
                          {tick.toFixed(1)}
                        </text>
                      </g>
                    );
                  })}

                  <line
                    x1={volcanoX(-effectThresholdX)}
                    y1={MARGIN.top}
                    x2={volcanoX(-effectThresholdX)}
                    y2={CHART_HEIGHT - MARGIN.bottom}
                    stroke="rgb(14 165 233 / 0.9)"
                    strokeDasharray="4 4"
                  />
                  <line
                    x1={volcanoX(effectThresholdX)}
                    y1={MARGIN.top}
                    x2={volcanoX(effectThresholdX)}
                    y2={CHART_HEIGHT - MARGIN.bottom}
                    stroke="rgb(14 165 233 / 0.9)"
                    strokeDasharray="4 4"
                  />
                  <line
                    x1={MARGIN.left}
                    y1={volcanoY(significanceThresholdY)}
                    x2={CHART_WIDTH - MARGIN.right}
                    y2={volcanoY(significanceThresholdY)}
                    stroke="rgb(225 29 72 / 0.9)"
                    strokeDasharray="4 4"
                  />

                  {rows.map((row) => {
                    const x = volcanoX(row.log2FoldChange);
                    const y = volcanoY(row.negLog10PValue);
                    const isSignificant = row.pValue < 0.05;

                    return (
                      <g key={row.id}>
                        <circle
                          cx={x}
                          cy={y}
                          r={isSignificant ? 5.5 : 4}
                          fill={STATUS_COLOR[row.status]}
                          fillOpacity={isSignificant ? 0.95 : 0.7}
                          stroke="white"
                          strokeWidth={1.5}
                        />
                        <title>
                          {`${row.marker}: log2 FC ${row.log2FoldChange.toFixed(2)}, p ${formatPValue(
                            row.pValue,
                          )}`}
                        </title>
                      </g>
                    );
                  })}

                  <text x={CHART_WIDTH / 2} y={CHART_HEIGHT - 3} textAnchor="middle" fontSize="12" fill="#475569">
                    log2 fold change
                  </text>
                  <text
                    x={18}
                    y={CHART_HEIGHT / 2}
                    textAnchor="middle"
                    transform={`rotate(-90 18 ${CHART_HEIGHT / 2})`}
                    fontSize="12"
                    fill="#475569"
                  >
                    -log10(p-value)
                  </text>
                </>
              )}
            </svg>
          ) : (
            <div className="flex h-[340px] items-center justify-center rounded-2xl border border-slate-200 bg-white text-sm text-slate-500">
              Run a paper analysis to populate trajectory and volcano plots.
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-3 text-xs text-slate-600">
        <div className="rounded-full bg-sky-100 px-3 py-1.5 font-medium text-sky-700">
          Control trend
        </div>
        <div className="rounded-full bg-emerald-100 px-3 py-1.5 font-medium text-emerald-700">
          Treated trend
        </div>
        <div className="rounded-full bg-rose-100 px-3 py-1.5 font-medium text-rose-700">
          Volcano threshold: p &lt; 0.05
        </div>
      </div>

      {hasData ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <p className="text-xs uppercase tracking-[0.1em] text-slate-500">Strongest effect</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">
              {strongestMarker?.marker}
            </p>
            <p className="text-xs text-slate-600">
              log2 FC {strongestMarker?.log2FoldChange.toFixed(2)}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <p className="text-xs uppercase tracking-[0.1em] text-slate-500">Most significant</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">
              {mostSignificantMarker?.marker}
            </p>
            <p className="text-xs text-slate-600">
              p-value {mostSignificantMarker ? formatPValue(mostSignificantMarker.pValue) : "--"}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <p className="text-xs uppercase tracking-[0.1em] text-slate-500">Mean abs effect</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">
              {meanAbsEffect.toFixed(2)}
            </p>
            <p className="text-xs text-slate-600">Across all markers</p>
          </div>
        </div>
      ) : null}
    </section>
  );
}
