"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Upload, FileText, X, Loader2, AlertTriangle, Link2, CheckCircle2, Globe } from "lucide-react";

const ACCEPTED_EXTENSIONS = [".pdf"];
const REJECTED_EXTENSIONS_MAP: Record<string, string> = {
  ".doc": "Word documents are not supported. Please convert to PDF first.",
  ".docx": "Word documents are not supported. Please convert to PDF first.",
  ".txt": "Plain text files are not supported. Please upload a PDF research paper.",
  ".jpg": "Image files are not supported. Please upload the paper as a PDF.",
  ".jpeg": "Image files are not supported. Please upload the paper as a PDF.",
  ".png": "Image files are not supported. Please upload the paper as a PDF.",
  ".xlsx": "Spreadsheet files are not supported. Please upload a PDF research paper.",
  ".csv": "CSV files are not supported. Please upload a PDF research paper.",
  ".pptx": "Presentation files are not supported. Please upload a PDF research paper.",
  ".html": "HTML files are not supported. Please upload a PDF research paper.",
  ".xml": "XML files are not supported. Please upload a PDF research paper.",
  ".zip": "Archive files are not supported. Please upload a PDF research paper.",
};
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

interface PaperDropZoneProps {
  onFileAccepted: (file: File) => void;
  onUrlSubmit: (url: string) => void;
  isProcessing: boolean;
}

type UrlValidation = {
  valid: boolean;
  source: string | null;
  message: string;
};

const KNOWN_SOURCES: { pattern: RegExp; name: string; icon: string }[] = [
  { pattern: /arxiv\.org/i, name: "arXiv", icon: "ar" },
  { pattern: /biorxiv\.org/i, name: "bioRxiv", icon: "bR" },
  { pattern: /medrxiv\.org/i, name: "medRxiv", icon: "mR" },
  { pattern: /pubmed\.ncbi\.nlm\.nih\.gov|ncbi\.nlm\.nih\.gov\/pubmed/i, name: "PubMed", icon: "PM" },
  { pattern: /doi\.org/i, name: "DOI", icon: "DOI" },
  { pattern: /nature\.com/i, name: "Nature", icon: "N" },
  { pattern: /science\.org|sciencemag\.org/i, name: "Science", icon: "Sc" },
  { pattern: /cell\.com/i, name: "Cell", icon: "Ce" },
  { pattern: /plos\.org/i, name: "PLOS", icon: "PL" },
];

function validateUrl(input: string): UrlValidation {
  const trimmed = input.trim();
  if (!trimmed) return { valid: false, source: null, message: "" };
  try {
    const parsed = new URL(trimmed);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return { valid: false, source: null, message: "Only http and https URLs are supported" };
    }
    const matched = KNOWN_SOURCES.find((s) => s.pattern.test(trimmed));
    if (matched) {
      return { valid: true, source: matched.name, message: `${matched.name} paper detected` };
    }
    return { valid: true, source: null, message: "Valid URL" };
  } catch {
    if (trimmed.includes(".") && !trimmed.includes(" ")) {
      return { valid: false, source: null, message: "Add https:// prefix to your URL" };
    }
    return { valid: false, source: null, message: "Enter a valid URL (e.g., https://arxiv.org/abs/...)" };
  }
}

function validateFile(file: File): string | null {
  if (file.size === 0) {
    return "The file appears to be empty. Please upload a valid PDF.";
  }
  if (file.size > MAX_FILE_SIZE) {
    return `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum size is 50 MB.`;
  }
  const ext = file.name.toLowerCase().slice(file.name.lastIndexOf("."));
  if (!ext || ext === file.name.toLowerCase()) {
    return "File has no extension. Please upload a .pdf file.";
  }
  if (REJECTED_EXTENSIONS_MAP[ext]) {
    return REJECTED_EXTENSIONS_MAP[ext];
  }
  if (!ACCEPTED_EXTENSIONS.includes(ext)) {
    return `"${ext}" files are not supported. Please upload a PDF research paper.`;
  }
  return null;
}

export default function PaperDropZone({
  onFileAccepted,
  onUrlSubmit,
  isProcessing,
}: PaperDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"file" | "url">("file");
  const [url, setUrl] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);
  const [urlValidation, setUrlValidation] = useState<UrlValidation>({ valid: false, source: null, message: "" });
  const inputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);

  useEffect(() => {
    const validation = validateUrl(url);
    setUrlValidation(validation);
  }, [url]);

  const handleFile = useCallback(
    (f: File) => {
      setError(null);
      const validationError = validateFile(f);
      if (validationError) {
        setError(validationError);
        setFile(null);
        return;
      }
      setFile(f);
      onFileAccepted(f);
    },
    [onFileAccepted]
  );

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      dragCounter.current = 0;

      const files = e.dataTransfer.files;
      if (files.length > 1) {
        setError("Please upload only one file at a time.");
        return;
      }
      if (files.length === 1) {
        handleFile(files[0]);
      }
    },
    [handleFile]
  );

  const handleUrlSubmit = useCallback(() => {
    const trimmed = url.trim();
    if (!trimmed) return;
    setUrlError(null);
    const validation = validateUrl(trimmed);
    if (!validation.valid) {
      setUrlError(validation.message);
      return;
    }
    onUrlSubmit(trimmed);
  }, [url, onUrlSubmit]);

  const clearFile = useCallback(() => {
    setFile(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  return (
    <div className="w-full space-y-4">
      {/* Mode Toggle */}
      <div className="flex gap-1 rounded-xl bg-zinc-100 p-1 w-fit dark:bg-zinc-800/80">
        <button
          onClick={() => { setMode("file"); setError(null); setUrlError(null); }}
          className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-medium transition-all cursor-pointer ${
            mode === "file"
              ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-100"
              : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
          }`}
        >
          <Upload className="h-3.5 w-3.5" />
          Upload File
        </button>
        <button
          onClick={() => { setMode("url"); setError(null); setUrlError(null); }}
          className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-medium transition-all cursor-pointer ${
            mode === "url"
              ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-100"
              : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
          }`}
        >
          <Link2 className="h-3.5 w-3.5" />
          Paste URL
        </button>
      </div>

      {mode === "file" ? (
        <div
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onClick={() => !isProcessing && inputRef.current?.click()}
          className={`
            relative flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed
            px-8 py-14 text-center transition-all duration-200 cursor-pointer
            ${
              isDragging
                ? "border-emerald-400 bg-emerald-400/5 scale-[1.01]"
                : file && !error
                ? "border-emerald-500/40 bg-emerald-500/5"
                : error
                ? "border-red-400/40 bg-red-500/5"
                : "border-zinc-200 bg-zinc-50/50 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/50 dark:hover:border-zinc-700"
            }
            ${isProcessing ? "pointer-events-none" : ""}
          `}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".pdf"
            onChange={(e) => {
              const selected = e.target.files?.[0];
              if (selected) handleFile(selected);
              e.target.value = "";
            }}
            className="hidden"
          />

          {isProcessing ? (
            <>
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 dark:bg-emerald-900/30">
                <Loader2 className="h-7 w-7 text-emerald-600 dark:text-emerald-400 animate-spin" />
              </div>
              <div>
                <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  Analyzing paper...
                </p>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  Generating synthetic data from your research paper
                </p>
              </div>
            </>
          ) : file && !error ? (
            <>
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 dark:bg-emerald-900/30">
                <FileText className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  {file.name}
                </p>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  clearFile();
                }}
                className="absolute right-4 top-4 rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </>
          ) : (
            <>
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-100 dark:bg-zinc-800">
                <Upload className="h-7 w-7 text-zinc-400 dark:text-zinc-500" />
              </div>
              <div>
                <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  Drop your research paper here
                </p>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  PDF format only &middot; Max 50 MB
                </p>
              </div>
              <span className="rounded-full bg-zinc-100 px-4 py-1.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                or click to browse
              </span>
            </>
          )}
        </div>
      ) : (
        /* URL Input Mode */
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <input
                type="url"
                value={url}
                onChange={(e) => { setUrl(e.target.value); setUrlError(null); }}
                onKeyDown={(e) => e.key === "Enter" && handleUrlSubmit()}
                placeholder="https://arxiv.org/abs/2401.12345"
                disabled={isProcessing}
                className={`w-full rounded-xl border bg-zinc-50 px-4 py-3 pr-10 text-sm text-zinc-900 placeholder:text-zinc-400 outline-none transition-all disabled:opacity-50 dark:bg-zinc-800/60 dark:text-zinc-100 dark:placeholder:text-zinc-600 ${
                  url.trim() && urlValidation.valid
                    ? "border-emerald-400 ring-2 ring-emerald-500/20 dark:border-emerald-500/60"
                    : url.trim() && !urlValidation.valid
                    ? "border-amber-400 ring-2 ring-amber-500/20 dark:border-amber-500/60"
                    : "border-zinc-200 focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:focus:border-emerald-500/60"
                }`}
              />
              {url.trim() && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {urlValidation.valid ? (
                    <CheckCircle2 className="h-4.5 w-4.5 text-emerald-500" />
                  ) : (
                    <AlertTriangle className="h-4.5 w-4.5 text-amber-500" />
                  )}
                </div>
              )}
            </div>
            <button
              onClick={handleUrlSubmit}
              disabled={isProcessing || !url.trim() || !urlValidation.valid}
              className="rounded-xl bg-emerald-600 px-6 py-3 text-sm font-medium text-white transition-all hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              {isProcessing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Analyze"
              )}
            </button>
          </div>

          {/* Validation feedback */}
          <div className="mt-2.5 flex items-center gap-2">
            {url.trim() && urlValidation.valid && urlValidation.source ? (
              <div className="flex items-center gap-2">
                <span className="inline-flex h-5 items-center gap-1 rounded-full bg-emerald-50 px-2 text-[10px] font-bold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                  <Globe className="h-3 w-3" />
                  {urlValidation.source}
                </span>
                <span className="text-xs text-emerald-600 dark:text-emerald-400">{urlValidation.message}</span>
              </div>
            ) : url.trim() && !urlValidation.valid && urlValidation.message ? (
              <span className="text-xs text-amber-600 dark:text-amber-400">{urlValidation.message}</span>
            ) : (
              <p className="text-xs text-zinc-400 dark:text-zinc-500">
                Supports arXiv, bioRxiv, medRxiv, PubMed, DOI, Nature, Science, Cell, PLOS
              </p>
            )}
          </div>
        </div>
      )}

      {/* Error Display */}
      {(error || urlError) && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 dark:border-red-500/20 dark:bg-red-500/5">
          <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 shrink-0 dark:text-red-400" />
          <div>
            <p className="text-sm text-red-700 dark:text-red-300">
              {error || urlError}
            </p>
            {error && (
              <button
                onClick={clearFile}
                className="mt-1.5 text-xs text-red-500 underline underline-offset-2 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 cursor-pointer"
              >
                Dismiss
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
