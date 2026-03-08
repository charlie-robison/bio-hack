import type { SyntheticDataset } from "./types";

interface PipelinePanelProps {
  dataset: SyntheticDataset | null;
  isLoading: boolean;
  selectedFileName: string | null;
}

type StepState = "complete" | "active" | "idle";

const STEP_STYLES: Record<StepState, string> = {
  complete: "border-emerald-400 bg-emerald-500 text-white",
  active: "border-sky-400 bg-sky-500 text-white",
  idle: "border-slate-300 bg-white text-slate-500",
};

const stateFromIndex = (index: number, datasetReady: boolean, loading: boolean, hasFile: boolean): StepState => {
  if (datasetReady) {
    return "complete";
  }

  if (!hasFile) {
    return "idle";
  }

  if (!loading) {
    return index === 0 ? "active" : "idle";
  }

  if (index === 0) {
    return "complete";
  }

  if (index === 1) {
    return "active";
  }

  return "idle";
};

const formatTimestamp = (isoDate: string) => {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(isoDate));
};

export function PipelinePanel({ dataset, isLoading, selectedFileName }: PipelinePanelProps) {
  const hasFile = Boolean(selectedFileName);
  const steps = [
    {
      title: "Document parse",
      detail: hasFile ? "Paper loaded and staged" : "Waiting for upload",
    },
    {
      title: "Bio marker extraction",
      detail: dataset
        ? "Candidate entities synthesized"
        : isLoading
          ? "Entity graph in progress"
          : "Run analysis to begin",
    },
    {
      title: "Synthetic cohort generation",
      detail: dataset
        ? `Rows generated: ${dataset.rows.length}`
        : isLoading
          ? "Preparing assay outputs"
          : "No output yet",
    },
  ];

  const responsePreview = dataset
    ? JSON.stringify(
        {
          paperTitle: dataset.paperTitle,
          generatedAt: dataset.generatedAt,
          rows: dataset.rows.length,
          pipelineVersion: dataset.pipelineVersion,
        },
        null,
        2,
      )
    : `{
  "paperTitle": "...",
  "generatedAt": "...",
  "rows": 0,
  "pipelineVersion": "synth-v1.2"
}`;

  return (
    <section className="panel-card p-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            Pipeline status
          </p>
          <h3 className="mt-1 text-xl font-semibold text-slate-900">Endpoint simulation workflow</h3>
        </div>
        <div className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-medium text-slate-700">
          {dataset
            ? `Completed ${formatTimestamp(dataset.generatedAt)}`
            : isLoading
              ? "Running"
              : "Idle"}
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(240px,320px)]">
        <ol className="space-y-3" aria-label="Pipeline steps">
          {steps.map((step, index) => {
            const stepState = stateFromIndex(index, Boolean(dataset), isLoading, hasFile);

            return (
              <li key={step.title} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                <div className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${STEP_STYLES[stepState]}`}
                  >
                    {index + 1}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{step.title}</p>
                    <p className="text-xs text-slate-600">{step.detail}</p>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>

        <div className="rounded-2xl border border-slate-200 bg-slate-950 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-300">
            Mock response snapshot
          </p>
          <p className="mt-1 text-[11px] text-slate-400">POST /api/research/synthetic-analysis</p>
          <pre className="mt-3 overflow-x-auto rounded-xl bg-slate-900 p-3 text-xs text-emerald-200">
            <code>{responsePreview}</code>
          </pre>
        </div>
      </div>
    </section>
  );
}
