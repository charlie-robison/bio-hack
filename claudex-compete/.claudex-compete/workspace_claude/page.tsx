"use client";

import { useState, useEffect, useRef } from "react";

/* ─────────────────────────── animated counter ────────────────────────── */
function useCountUp(end: number, duration = 2000, startOnView = true) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);

  useEffect(() => {
    if (!startOnView) return;
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true;
          const start = performance.now();
          const tick = (now: number) => {
            const elapsed = now - start;
            const progress = Math.min(elapsed / duration, 1);
            const ease = 1 - Math.pow(1 - progress, 3);
            setCount(Math.round(ease * end));
            if (progress < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }
      },
      { threshold: 0.3 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [end, duration, startOnView]);

  return { count, ref };
}

/* ──────────────────── floating particle background ───────────────────── */
function ParticleField() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {Array.from({ length: 24 }).map((_, i) => {
        const size = 2 + (i % 3) * 1.5;
        const left = (i * 4.17) % 100;
        const delay = (i * 0.7) % 8;
        const dur = 12 + (i % 5) * 4;
        return (
          <span
            key={i}
            className="absolute rounded-full opacity-20"
            style={{
              width: size,
              height: size,
              left: `${left}%`,
              top: `${20 + (i * 3.3) % 60}%`,
              background: i % 3 === 0 ? "#34d399" : i % 3 === 1 ? "#60a5fa" : "#a78bfa",
              animation: `float-particle ${dur}s ease-in-out ${delay}s infinite alternate`,
            }}
          />
        );
      })}
    </div>
  );
}

/* ────────────────────────── DNA helix graphic ────────────────────────── */
function DnaHelix({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 320"
      className={className}
      fill="none"
      aria-hidden="true"
    >
      {Array.from({ length: 16 }).map((_, i) => {
        const y = i * 20 + 10;
        const phase = (i / 16) * Math.PI * 4;
        const x1 = 60 + Math.sin(phase) * 30;
        const x2 = 60 - Math.sin(phase) * 30;
        const opacity = 0.15 + Math.abs(Math.sin(phase)) * 0.35;
        return (
          <g key={i}>
            <line
              x1={x1}
              y1={y}
              x2={x2}
              y2={y}
              stroke="#34d399"
              strokeWidth="1"
              opacity={opacity * 0.5}
            />
            <circle cx={x1} cy={y} r="3" fill="#34d399" opacity={opacity} />
            <circle cx={x2} cy={y} r="3" fill="#60a5fa" opacity={opacity} />
          </g>
        );
      })}
    </svg>
  );
}

/* ─────────────────── molecular structure icon ────────────────────────── */
function MoleculeIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none" aria-hidden="true">
      <circle cx="32" cy="16" r="5" stroke="#34d399" strokeWidth="1.5" opacity="0.8" />
      <circle cx="16" cy="40" r="5" stroke="#60a5fa" strokeWidth="1.5" opacity="0.8" />
      <circle cx="48" cy="40" r="5" stroke="#a78bfa" strokeWidth="1.5" opacity="0.8" />
      <circle cx="32" cy="52" r="4" stroke="#34d399" strokeWidth="1.5" opacity="0.6" />
      <line x1="32" y1="21" x2="16" y2="35" stroke="#34d399" strokeWidth="1" opacity="0.4" />
      <line x1="32" y1="21" x2="48" y2="35" stroke="#60a5fa" strokeWidth="1" opacity="0.4" />
      <line x1="16" y1="45" x2="32" y2="48" stroke="#a78bfa" strokeWidth="1" opacity="0.4" />
      <line x1="48" y1="45" x2="32" y2="48" stroke="#34d399" strokeWidth="1" opacity="0.4" />
    </svg>
  );
}

/* ────────────────────── feature card icons (SVG) ─────────────────────── */
const icons = {
  parse: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
      <path d="M10 9H8" />
    </svg>
  ),
  verify: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  ),
  stats: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
      <path d="M3 3v18h18" />
      <path d="m19 9-5 5-4-4-3 3" />
    </svg>
  ),
  molecule: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
      <circle cx="12" cy="6" r="2" />
      <circle cx="6" cy="18" r="2" />
      <circle cx="18" cy="18" r="2" />
      <path d="M12 8v4" />
      <path d="m11.5 12.5-4 4" />
      <path d="m12.5 12.5 4 4" />
    </svg>
  ),
  brain: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
      <path d="M12 2a4 4 0 0 0-4 4c0 .5.1 1 .3 1.4A3.5 3.5 0 0 0 5 11c0 1 .4 1.9 1.1 2.6A3.5 3.5 0 0 0 5 16.5 3.5 3.5 0 0 0 8.5 20h1.7" />
      <path d="M12 2a4 4 0 0 1 4 4c0 .5-.1 1-.3 1.4A3.5 3.5 0 0 1 19 11c0 1-.4 1.9-1.1 2.6A3.5 3.5 0 0 1 19 16.5a3.5 3.5 0 0 1-3.5 3.5h-1.7" />
      <path d="M12 2v20" />
    </svg>
  ),
  api: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
      <path d="m16 18 6-6-6-6" />
      <path d="m8 6-6 6 6 6" />
      <path d="m14.5 4-5 16" />
    </svg>
  ),
};

/* ────────────────────────── feature data ──────────────────────────────── */
const features = [
  {
    icon: icons.parse,
    title: "Deep Paper Parsing",
    description:
      "Extracts claims, figures, tables, and statistical results from PDFs using multimodal AI. Handles supplementary materials and cross-references.",
    color: "emerald" as const,
  },
  {
    icon: icons.verify,
    title: "Claim Verification",
    description:
      "Cross-references extracted claims against PubMed, ChEMBL, and UniProt databases. Flags contradictions and unsupported assertions with confidence scores.",
    color: "blue" as const,
  },
  {
    icon: icons.stats,
    title: "Statistical Audit",
    description:
      "Validates p-values, effect sizes, and sample sizes against reported methodology. Detects common errors like p-hacking patterns and implausible distributions.",
    color: "violet" as const,
  },
  {
    icon: icons.molecule,
    title: "Structure Validation",
    description:
      "Verifies molecular structures, SMILES notation, and compound identifiers. Catches mismatches between reported compounds and known chemical databases.",
    color: "emerald" as const,
  },
  {
    icon: icons.brain,
    title: "LLM Reasoning Engine",
    description:
      "Uses chain-of-thought reasoning to evaluate experimental logic, identify methodological gaps, and assess reproducibility of reported findings.",
    color: "blue" as const,
  },
  {
    icon: icons.api,
    title: "API & Integrations",
    description:
      "REST API for programmatic access. Integrate BioFact into your review pipeline, CI/CD for preprints, or institutional submission workflows.",
    color: "violet" as const,
  },
];

/* ────────────────────────── color map ─────────────────────────────────── */
const colorMap = {
  emerald: {
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/20",
    text: "text-emerald-400",
    glow: "shadow-emerald-500/5",
    ring: "ring-emerald-500/20",
  },
  blue: {
    bg: "bg-blue-500/10",
    border: "border-blue-500/20",
    text: "text-blue-400",
    glow: "shadow-blue-500/5",
    ring: "ring-blue-500/20",
  },
  violet: {
    bg: "bg-violet-500/10",
    border: "border-violet-500/20",
    text: "text-violet-400",
    glow: "shadow-violet-500/5",
    ring: "ring-violet-500/20",
  },
};

/* ──────────────────────────── step data ───────────────────────────────── */
const steps = [
  {
    num: "01",
    title: "Upload a paper",
    desc: "Drag & drop any drug discovery PDF — preprint, journal article, or regulatory filing.",
  },
  {
    num: "02",
    title: "Automated analysis",
    desc: "BioFact parses every claim, figure, and statistical test in under 60 seconds.",
  },
  {
    num: "03",
    title: "Review results",
    desc: "Get a detailed report with confidence scores, flagged issues, and source citations.",
  },
];

/* ═══════════════════════════════════════════════════════════════════════ */
/*                          MAIN COMPONENT                               */
/* ═══════════════════════════════════════════════════════════════════════ */

export default function BioFactLanding() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);

  const papers = useCountUp(12847);
  const claims = useCountUp(284000);
  const accuracy = useCountUp(97);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-emerald-500/30 overflow-x-hidden">
      {/* global keyframes */}
      <style>{`
        @keyframes float-particle {
          0% { transform: translateY(0) translateX(0); }
          100% { transform: translateY(-30px) translateX(15px); }
        }
        @keyframes fade-in-up {
          0% { opacity: 0; transform: translateY(24px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse-glow {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.8; }
        }
        @keyframes gradient-x {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        @keyframes scan-line {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(100%); }
        }
        .animate-fade-in-up { animation: fade-in-up 0.8s ease-out both; }
        .animate-fade-in-up-d1 { animation: fade-in-up 0.8s ease-out 0.1s both; }
        .animate-fade-in-up-d2 { animation: fade-in-up 0.8s ease-out 0.2s both; }
        .animate-fade-in-up-d3 { animation: fade-in-up 0.8s ease-out 0.3s both; }
        .animate-fade-in-up-d4 { animation: fade-in-up 0.8s ease-out 0.4s both; }
        .gradient-text {
          background: linear-gradient(135deg, #34d399 0%, #60a5fa 50%, #a78bfa 100%);
          background-size: 200% 200%;
          animation: gradient-x 6s ease infinite;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
      `}</style>

      {/* ───────────────────────── NAVBAR ──────────────────────────────── */}
      <nav
        className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
          scrolled
            ? "bg-zinc-950/80 backdrop-blur-xl border-b border-zinc-800/60 shadow-lg shadow-black/20"
            : "bg-transparent"
        }`}
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between px-6 py-4">
          {/* Logo */}
          <a href="#" className="flex items-center gap-2.5 group">
            <div className="relative w-8 h-8">
              <div className="absolute inset-0 rounded-lg bg-emerald-500/20 group-hover:bg-emerald-500/30 transition-colors" />
              <svg viewBox="0 0 32 32" className="relative w-8 h-8" fill="none">
                <path
                  d="M16 4 L26 10 L26 22 L16 28 L6 22 L6 10 Z"
                  stroke="#34d399"
                  strokeWidth="1.5"
                  fill="#34d399"
                  fillOpacity="0.1"
                />
                <path
                  d="M12 14 L15 17 L20 12"
                  stroke="#34d399"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <span className="text-lg font-bold tracking-tight">
              Bio<span className="text-emerald-400">Fact</span>
            </span>
          </a>

          {/* Desktop links */}
          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-sm text-zinc-400 hover:text-zinc-100 transition-colors">
              Features
            </a>
            <a href="#how-it-works" className="text-sm text-zinc-400 hover:text-zinc-100 transition-colors">
              How it works
            </a>
            <a href="#metrics" className="text-sm text-zinc-400 hover:text-zinc-100 transition-colors">
              Metrics
            </a>
            <a
              href="#cta"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-sm font-semibold transition-colors"
            >
              Get started
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </a>
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileNav(!mobileNav)}
            className="md:hidden p-2 text-zinc-400 hover:text-white transition-colors"
            aria-label="Toggle navigation"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              {mobileNav ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>

        {/* Mobile dropdown */}
        {mobileNav && (
          <div className="md:hidden bg-zinc-900/95 backdrop-blur-xl border-b border-zinc-800 px-6 pb-6 space-y-4">
            <a href="#features" onClick={() => setMobileNav(false)} className="block text-sm text-zinc-300 hover:text-white py-2">
              Features
            </a>
            <a href="#how-it-works" onClick={() => setMobileNav(false)} className="block text-sm text-zinc-300 hover:text-white py-2">
              How it works
            </a>
            <a href="#metrics" onClick={() => setMobileNav(false)} className="block text-sm text-zinc-300 hover:text-white py-2">
              Metrics
            </a>
            <a
              href="#cta"
              onClick={() => setMobileNav(false)}
              className="block text-center px-4 py-2.5 rounded-lg bg-emerald-500 text-zinc-950 text-sm font-semibold"
            >
              Get started
            </a>
          </div>
        )}
      </nav>

      {/* ────────────────────────── HERO ───────────────────────────────── */}
      <section className="relative pt-32 pb-20 md:pt-44 md:pb-32 overflow-hidden">
        <ParticleField />

        {/* radial glow */}
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full pointer-events-none"
          style={{
            background:
              "radial-gradient(circle, rgba(52,211,153,0.08) 0%, rgba(96,165,250,0.04) 40%, transparent 70%)",
          }}
          aria-hidden="true"
        />

        {/* decorative DNA helices */}
        <DnaHelix className="absolute left-4 md:left-12 top-28 w-16 md:w-20 opacity-30" />
        <DnaHelix className="absolute right-4 md:right-12 top-36 w-14 md:w-16 opacity-20 scale-x-[-1]" />
        <MoleculeIcon className="absolute top-40 right-[15%] w-16 opacity-15 hidden lg:block" />

        <div className="relative max-w-5xl mx-auto px-6 text-center">
          {/* Badge */}
          <div className="animate-fade-in-up inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 mb-8">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs font-medium text-emerald-400 tracking-wide uppercase">
              Now in public beta
            </span>
          </div>

          {/* Heading */}
          <h1 className="animate-fade-in-up-d1 text-4xl sm:text-5xl md:text-7xl font-extrabold tracking-tight leading-[1.1]">
            Computational
            <br />
            <span className="gradient-text">fact-checking</span>
            <br />
            for drug discovery
          </h1>

          {/* Subheading */}
          <p className="animate-fade-in-up-d2 mt-6 md:mt-8 text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto leading-relaxed">
            Upload any drug discovery paper. BioFact parses every claim, cross-references
            biomedical databases, audits statistics, and delivers a reproducibility report
            — in seconds, not weeks.
          </p>

          {/* CTA buttons */}
          <div className="animate-fade-in-up-d3 mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="#cta"
              className="group relative inline-flex items-center gap-2 px-7 py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-base transition-all shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30"
            >
              <span>Try BioFact free</span>
              <svg className="w-4 h-4 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </a>
            <a
              href="#how-it-works"
              className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl border border-zinc-700 hover:border-zinc-500 text-zinc-300 hover:text-white font-medium text-base transition-all"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" />
                <polygon points="10,8 16,12 10,16" fill="currentColor" stroke="none" />
              </svg>
              See how it works
            </a>
          </div>

          {/* Trust line */}
          <p className="animate-fade-in-up-d4 mt-8 text-xs text-zinc-500">
            Trusted by researchers at Stanford, MIT, and the NIH.&nbsp; No credit card required.
          </p>

          {/* ── Hero visual: simulated analysis card ────────────────────── */}
          <div className="animate-fade-in-up-d4 relative mt-16 md:mt-20 max-w-3xl mx-auto">
            {/* Outer glow */}
            <div className="absolute -inset-px rounded-2xl bg-gradient-to-b from-emerald-500/20 via-blue-500/10 to-violet-500/10 blur-sm" />

            <div className="relative rounded-2xl bg-zinc-900 border border-zinc-800 overflow-hidden shadow-2xl shadow-black/40">
              {/* Title bar */}
              <div className="flex items-center gap-2 px-5 py-3 border-b border-zinc-800 bg-zinc-900/80">
                <span className="w-3 h-3 rounded-full bg-red-500/70" />
                <span className="w-3 h-3 rounded-full bg-yellow-500/70" />
                <span className="w-3 h-3 rounded-full bg-green-500/70" />
                <span className="ml-3 text-xs text-zinc-500 font-mono">BioFact Analysis — Chen et al. 2024</span>
              </div>

              {/* Content */}
              <div className="p-5 md:p-7 space-y-5 text-left">
                {/* Paper title */}
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">Analyzing</span>
                  <h3 className="text-sm md:text-base font-semibold text-white mt-1 leading-snug">
                    &ldquo;Novel PROTAC Degraders Targeting BRD4 in Triple-Negative Breast Cancer&rdquo;
                  </h3>
                </div>

                {/* Progress rows */}
                <div className="space-y-3">
                  {[
                    { label: "Claim extraction", pct: 100, status: "23 claims found", color: "bg-emerald-500" },
                    { label: "Database cross-ref", pct: 100, status: "ChEMBL / UniProt matched", color: "bg-blue-500" },
                    { label: "Statistical audit", pct: 100, status: "2 anomalies flagged", color: "bg-amber-500" },
                    { label: "Structure verification", pct: 78, status: "Running...", color: "bg-violet-500" },
                  ].map((row) => (
                    <div key={row.label} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-zinc-400">{row.label}</span>
                        <span className={row.pct === 100 ? "text-zinc-300" : "text-zinc-500"}>
                          {row.status}
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${row.color} transition-all duration-1000`}
                          style={{ width: `${row.pct}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Flagged finding */}
                <div className="rounded-lg bg-amber-500/5 border border-amber-500/20 p-3.5">
                  <div className="flex items-start gap-2.5">
                    <svg className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                    </svg>
                    <div>
                      <p className="text-xs font-medium text-amber-300">Statistical anomaly detected</p>
                      <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed">
                        Fig. 3B reports p = 0.0003 (n=6), but effect size (Cohen&apos;s d = 0.41) is inconsistent
                        with claimed statistical power. Recommend verification with larger sample.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Scan line overlay */}
              <div className="absolute inset-0 pointer-events-none overflow-hidden">
                <div
                  className="absolute inset-x-0 h-8 bg-gradient-to-b from-emerald-500/[0.03] to-transparent"
                  style={{ animation: "scan-line 4s linear infinite" }}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─────────────────── METRICS / SOCIAL PROOF ────────────────────── */}
      <section id="metrics" className="relative py-16 md:py-20 border-y border-zinc-800/60">
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 md:gap-12 text-center">
            <div>
              <p className="text-4xl md:text-5xl font-extrabold tracking-tight">
                <span ref={papers.ref} className="gradient-text">
                  {papers.count.toLocaleString()}
                </span>
              </p>
              <p className="mt-2 text-sm text-zinc-500">papers analyzed</p>
            </div>
            <div>
              <p className="text-4xl md:text-5xl font-extrabold tracking-tight">
                <span ref={claims.ref} className="gradient-text">
                  {claims.count >= 1000
                    ? `${(claims.count / 1000).toFixed(claims.count >= 100000 ? 0 : 0)}K`
                    : claims.count.toLocaleString()}
                </span>
                <span className="text-2xl text-zinc-600">+</span>
              </p>
              <p className="mt-2 text-sm text-zinc-500">claims verified</p>
            </div>
            <div>
              <p className="text-4xl md:text-5xl font-extrabold tracking-tight">
                <span ref={accuracy.ref} className="gradient-text">
                  {accuracy.count}
                </span>
                <span className="text-2xl text-zinc-600">%</span>
              </p>
              <p className="mt-2 text-sm text-zinc-500">detection accuracy</p>
            </div>
          </div>
        </div>
      </section>

      {/* ───────────────────────── FEATURES ────────────────────────────── */}
      <section id="features" className="relative py-20 md:py-28">
        <div className="max-w-6xl mx-auto px-6">
          {/* Section header */}
          <div className="text-center mb-14 md:mb-20">
            <p className="text-xs uppercase tracking-widest text-emerald-400 font-semibold mb-3">
              Capabilities
            </p>
            <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight">
              Everything you need to{" "}
              <span className="gradient-text">validate research</span>
            </h2>
            <p className="mt-4 text-zinc-400 max-w-xl mx-auto">
              Six integrated modules that catch what peer reviewers miss — from statistical errors to incorrect molecular structures.
            </p>
          </div>

          {/* Feature grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map((f) => {
              const c = colorMap[f.color];
              return (
                <div
                  key={f.title}
                  className={`group relative rounded-xl border ${c.border} bg-zinc-900/60 p-6 transition-all hover:bg-zinc-900 hover:shadow-xl ${c.glow} hover:border-opacity-50`}
                >
                  {/* Icon */}
                  <div
                    className={`w-11 h-11 rounded-lg ${c.bg} flex items-center justify-center ${c.text} mb-4 transition-transform group-hover:scale-110`}
                  >
                    {f.icon}
                  </div>

                  <h3 className="text-base font-semibold text-white mb-2">{f.title}</h3>
                  <p className="text-sm text-zinc-400 leading-relaxed">{f.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ─────────────────────── HOW IT WORKS ──────────────────────────── */}
      <section id="how-it-works" className="relative py-20 md:py-28 border-t border-zinc-800/60">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-14 md:mb-20">
            <p className="text-xs uppercase tracking-widest text-emerald-400 font-semibold mb-3">
              Workflow
            </p>
            <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight">
              Three steps to <span className="gradient-text">verified science</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {steps.map((s, i) => (
              <div key={s.num} className="relative group">
                {/* connector line (desktop) */}
                {i < steps.length - 1 && (
                  <div className="hidden md:block absolute top-8 left-[calc(50%+28px)] w-[calc(100%-56px)] h-px bg-gradient-to-r from-emerald-500/30 to-transparent" />
                )}

                <div className="text-center">
                  <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 mb-5 transition-transform group-hover:scale-110">
                    <span className="text-lg font-bold text-emerald-400">{s.num}</span>
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-2">{s.title}</h3>
                  <p className="text-sm text-zinc-400 leading-relaxed max-w-xs mx-auto">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ──────────────────── COMPARISON TABLE ─────────────────────────── */}
      <section className="relative py-20 md:py-28 border-t border-zinc-800/60">
        <div className="max-w-4xl mx-auto px-6">
          <div className="text-center mb-14">
            <p className="text-xs uppercase tracking-widest text-emerald-400 font-semibold mb-3">
              Why BioFact
            </p>
            <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight">
              Manual review vs.{" "}
              <span className="gradient-text">BioFact</span>
            </h2>
          </div>

          <div className="rounded-xl border border-zinc-800 overflow-hidden bg-zinc-900/50">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left py-4 px-5 text-zinc-500 font-medium w-1/3" />
                  <th className="text-center py-4 px-5 text-zinc-400 font-medium">Manual review</th>
                  <th className="text-center py-4 px-5 text-emerald-400 font-semibold">BioFact</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {[
                  ["Time per paper", "2 – 4 weeks", "< 60 seconds"],
                  ["Statistical validation", "Varies by reviewer", "Automated + audited"],
                  ["Database cross-ref", "Manual lookup", "PubMed, ChEMBL, UniProt"],
                  ["Structure verification", "Often skipped", "Automated SMILES check"],
                  ["Reproducibility score", "Subjective", "Quantified (0 – 100)"],
                  ["Cost", "$200 – $500 / paper", "Free during beta"],
                ].map(([label, manual, biofact]) => (
                  <tr key={label as string} className="hover:bg-zinc-800/30 transition-colors">
                    <td className="py-3.5 px-5 text-zinc-300 font-medium">{label}</td>
                    <td className="py-3.5 px-5 text-center text-zinc-500">{manual}</td>
                    <td className="py-3.5 px-5 text-center text-emerald-400 font-medium">{biofact}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ───────────────── TESTIMONIALS ────────────────────────────────── */}
      <section className="relative py-20 md:py-28 border-t border-zinc-800/60">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-14">
            <p className="text-xs uppercase tracking-widest text-emerald-400 font-semibold mb-3">
              Testimonials
            </p>
            <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight">
              Trusted by <span className="gradient-text">leading researchers</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                quote:
                  "BioFact caught a statistical error in our PROTAC paper that three peer reviewers missed. It saved us from retracting post-publication.",
                name: "Dr. Sarah Chen",
                role: "Medicinal Chemistry, Stanford",
              },
              {
                quote:
                  "We integrated BioFact into our preprint review pipeline. Our editors now get a reproducibility score before they even read the abstract.",
                name: "Prof. James Okonkwo",
                role: "Editor, Nature Chemical Biology",
              },
              {
                quote:
                  "The molecular structure validation alone would have saved our team months of wasted synthesis. This should be standard in every lab.",
                name: "Dr. Mei-Ling Park",
                role: "Drug Discovery, Novartis",
              },
            ].map((t) => (
              <div
                key={t.name}
                className="rounded-xl bg-zinc-900/60 border border-zinc-800 p-6 flex flex-col"
              >
                <svg className="w-8 h-8 text-emerald-500/30 mb-4 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M4.583 17.321C3.553 16.227 3 15 3 13.011c0-3.5 2.457-6.637 6.03-8.188l.893 1.378c-3.335 1.804-3.987 4.145-4.247 5.621.537-.278 1.24-.375 1.929-.311C9.591 11.71 11 13.203 11 15.07c0 1.935-1.565 3.5-3.5 3.5-1.073 0-2.09-.49-2.917-1.249ZM14.583 17.321C13.553 16.227 13 15 13 13.011c0-3.5 2.457-6.637 6.03-8.188l.893 1.378c-3.335 1.804-3.987 4.145-4.247 5.621.537-.278 1.24-.375 1.929-.311C19.591 11.71 21 13.203 21 15.07c0 1.935-1.565 3.5-3.5 3.5-1.073 0-2.09-.49-2.917-1.249Z" />
                </svg>
                <p className="text-sm text-zinc-300 leading-relaxed flex-1">{t.quote}</p>
                <div className="mt-5 pt-4 border-t border-zinc-800">
                  <p className="text-sm font-medium text-white">{t.name}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">{t.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ───────────────────── CTA SECTION ─────────────────────────────── */}
      <section id="cta" className="relative py-20 md:py-28">
        {/* background glow */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse at center, rgba(52,211,153,0.06) 0%, transparent 60%)",
          }}
          aria-hidden="true"
        />

        <div className="relative max-w-3xl mx-auto px-6 text-center">
          <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-8 md:p-14 shadow-2xl shadow-black/30">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 mb-6">
              <svg className="w-7 h-7 text-emerald-400" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 0 1-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 0 1 4.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0 1 12 15a9.065 9.065 0 0 0-6.23.693L5 14.5m14.8.8 1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0 1 12 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
              </svg>
            </div>

            <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight mb-3">
              Ready to verify your next paper?
            </h2>
            <p className="text-zinc-400 mb-8 max-w-lg mx-auto">
              Join thousands of researchers using BioFact to catch errors before publication.
              Free during public beta — no credit card required.
            </p>

            {/* Email form */}
            <form
              onSubmit={(e) => e.preventDefault()}
              className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto"
            >
              <label htmlFor="cta-email" className="sr-only">
                Email address
              </label>
              <input
                id="cta-email"
                type="email"
                placeholder="you@university.edu"
                className="flex-1 rounded-lg bg-zinc-800 border border-zinc-700 px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all"
              />
              <button
                type="submit"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-sm transition-colors whitespace-nowrap shadow-lg shadow-emerald-500/20"
              >
                Get early access
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </button>
            </form>

            <p className="mt-4 text-xs text-zinc-600">
              By signing up you agree to our Terms of Service and Privacy Policy.
            </p>
          </div>
        </div>
      </section>

      {/* ───────────────────────── FOOTER ──────────────────────────────── */}
      <footer className="border-t border-zinc-800/60 py-10 md:py-14">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            {/* Logo */}
            <div className="flex items-center gap-2">
              <div className="w-7 h-7">
                <svg viewBox="0 0 32 32" className="w-7 h-7" fill="none">
                  <path
                    d="M16 4 L26 10 L26 22 L16 28 L6 22 L6 10 Z"
                    stroke="#34d399"
                    strokeWidth="1.5"
                    fill="#34d399"
                    fillOpacity="0.1"
                  />
                  <path
                    d="M12 14 L15 17 L20 12"
                    stroke="#34d399"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <span className="text-sm font-bold tracking-tight text-zinc-400">
                Bio<span className="text-emerald-400">Fact</span>
              </span>
            </div>

            {/* Links */}
            <div className="flex items-center gap-6 text-sm text-zinc-500">
              <a href="#" className="hover:text-zinc-300 transition-colors">Documentation</a>
              <a href="#" className="hover:text-zinc-300 transition-colors">API</a>
              <a href="#" className="hover:text-zinc-300 transition-colors">GitHub</a>
              <a href="#" className="hover:text-zinc-300 transition-colors">Contact</a>
            </div>

            {/* Copyright */}
            <p className="text-xs text-zinc-600">
              &copy; {new Date().getFullYear()} BioFact. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
