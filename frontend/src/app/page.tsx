"use client";

import { useState, useCallback } from "react";

type Status = "idle" | "uploading" | "complete" | "error";

interface RunMetadata {
  run_id: string;
  original_filename: string;
  created_at: string;
  page_count: number;
  extracted_image_count: number;
}

interface UploadResult {
  success: boolean;
  run_id: string;
  metadata: RunMetadata;
  markdown_preview: string;
  error?: string;
}

export default function Home() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const processFile = async (file: File) => {
    if (!file.type.includes("pdf")) {
      setError("Please upload a PDF file");
      return;
    }

    setFileName(file.name);
    setError(null);
    setResult(null);
    setStatus("uploading");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("http://localhost:8080/api/upload", {
        method: "POST",
        body: formData,
      });

      const data: UploadResult = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Upload failed");
      }

      setResult(data);
      setStatus("complete");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">BioFact</h1>
          <p className="text-zinc-400">PDF Processing Pipeline</p>
        </div>

        {/* Dropzone */}
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          className={`
            relative border-2 border-dashed rounded-xl p-12 text-center transition-all cursor-pointer mb-6
            ${dragActive
              ? "border-emerald-500 bg-emerald-500/10"
              : "border-zinc-700 hover:border-zinc-500 bg-zinc-900/50"
            }
            ${status === "uploading" ? "pointer-events-none opacity-50" : ""}
          `}
        >
          <input
            type="file"
            accept=".pdf"
            onChange={handleFileInput}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            disabled={status === "uploading"}
          />

          <div className="space-y-4">
            <div className="w-16 h-16 mx-auto rounded-full bg-zinc-800 flex items-center justify-center">
              {status === "uploading" ? (
                <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg className="w-8 h-8 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              )}
            </div>
            <div>
              <p className="text-lg font-medium text-zinc-200">
                {status === "uploading" ? "Processing..." : fileName || "Drop your PDF here"}
              </p>
              <p className="text-sm text-zinc-500 mt-1">
                {status === "uploading" ? "Running LlamaParse + extracting images" : "or click to browse"}
              </p>
            </div>
          </div>
        </div>

        {/* Error */}
        {status === "error" && error && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-4 mb-6">
            <p className="text-red-400">{error}</p>
          </div>
        )}

        {/* Result */}
        {result && status === "complete" && (
          <div className="space-y-6">
            {/* Run Info */}
            <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Run Created</h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-zinc-500">Run ID</span>
                  <code className="text-emerald-400 bg-zinc-800 px-2 py-1 rounded text-sm">
                    {result.run_id}
                  </code>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">File</span>
                  <span className="text-zinc-200">{result.metadata.original_filename}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Pages</span>
                  <span className="text-zinc-200">{result.metadata.page_count}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Extracted Images</span>
                  <span className="text-zinc-200">{result.metadata.extracted_image_count}</span>
                </div>
              </div>
            </div>

            {/* Markdown Preview */}
            <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Markdown Preview</h3>
              <pre className="text-sm text-zinc-300 whitespace-pre-wrap font-mono bg-zinc-800 p-4 rounded-lg overflow-auto max-h-96">
                {result.markdown_preview}
              </pre>
            </div>

            {/* File Paths */}
            <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Stored Files</h3>
              <div className="font-mono text-sm space-y-1 text-zinc-400">
                <p>fs/runs/{result.run_id}/</p>
                <p className="pl-4">├── original.pdf</p>
                <p className="pl-4">├── content.md</p>
                <p className="pl-4">├── metadata.json</p>
                <p className="pl-4">├── pages/</p>
                <p className="pl-8">└── page_001.png ... page_{String(result.metadata.page_count).padStart(3, '0')}.png</p>
                <p className="pl-4">└── extracted_images/</p>
                <p className="pl-8">└── {result.metadata.extracted_image_count} images</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
