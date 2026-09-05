import {
  Cable,
  Download,
  Power,
  Volume2,
  Layers,
  Activity,
  MonitorSpeaker,
  ArrowRight,
  Zap,
  Shield,
} from "lucide-react";
import { LuGithub } from "react-icons/lu";

const GITHUB_URL = "https://github.com/KingIronMan2011/virtual-cable";
const DIRECT_DOWNLOAD_URL = `/releases/Virtual Cable_${__APP_VERSION__}_x64-setup.exe`;

// ── Header ────────────────────────────────────────────────────────────────────

function Header() {
  return (
    <header className="border-surface-border bg-bg/80 fixed inset-x-0 top-0 z-50 border-b backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <div className="flex items-center gap-2 font-semibold text-white">
          <Cable size={18} className="text-brand" />
          Virtual Cable
        </div>
        <nav className="flex items-center gap-3">
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 text-sm text-zinc-400 transition-colors hover:text-white"
          >
            <LuGithub size={15} />
            GitHub
          </a>
          <a
            href={DIRECT_DOWNLOAD_URL}
            download
            className="bg-brand hover:bg-brand-dim flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-black transition-colors"
          >
            <Download size={14} />
            Download
          </a>
        </nav>
      </div>
    </header>
  );
}

// ── Hero ──────────────────────────────────────────────────────────────────────

function CableAnimation() {
  return (
    <div className="my-10 flex items-center gap-0">
      {/* Jack plug */}
      <div className="bg-brand h-3 w-3 rounded-full shadow-[0_0_12px_#f59e0b]" />
      {/* Cable track */}
      <div className="bg-surface-raised relative h-1 w-48 overflow-hidden rounded-full">
        <div
          className="absolute inset-y-0 left-0 w-16 rounded-full"
          style={{
            background:
              "linear-gradient(90deg, transparent, #f59e0b, transparent)",
            animation: "slide 1.6s linear infinite",
          }}
        />
      </div>
      {/* Jack plug */}
      <div className="bg-brand h-3 w-3 rounded-full shadow-[0_0_12px_#f59e0b]" />
      <style>{`
        @keyframes slide {
          from { transform: translateX(-64px); }
          to   { transform: translateX(192px); }
        }
      `}</style>
    </div>
  );
}

function Hero() {
  return (
    <section className="px-6 pt-32 pb-24 text-center">
      <div className="mx-auto max-w-3xl">
        <div className="text-brand mb-6 inline-flex items-center gap-2 rounded-full border border-amber-900/40 bg-amber-950/40 px-3 py-1 text-xs font-medium">
          <Zap size={11} />
          Free &amp; open source
        </div>

        <h1 className="text-5xl leading-tight font-bold tracking-tight text-white sm:text-6xl">
          Route audio
          <br />
          <span className="text-brand">anywhere.</span>
        </h1>

        <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-zinc-400">
          Virtual Cable lets you patch any audio source to any destination on
          your PC — no drivers, no fuss. Built for streamers, podcasters, and
          producers.
        </p>

        <div className="flex justify-center">
          <CableAnimation />
        </div>

        <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
          <a
            href={DIRECT_DOWNLOAD_URL}
            download
            className="bg-brand hover:bg-brand-dim flex items-center gap-2 rounded-lg px-5 py-2.5 font-semibold text-black transition-colors"
          >
            <Download size={16} />
            Download for Windows
          </a>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            className="border-surface-border flex items-center gap-2 rounded-lg border px-5 py-2.5 text-zinc-300 transition-colors hover:border-zinc-600 hover:text-white"
          >
            <LuGithub size={16} />
            View source
          </a>
        </div>

        <p className="mt-4 text-xs text-zinc-600">
          Windows 10+ · macOS 12+ · No account required
        </p>
      </div>
    </section>
  );
}

// ── Features ──────────────────────────────────────────────────────────────────

const FEATURES = [
  {
    icon: Layers,
    title: "Multiple cables",
    body: "Create as many virtual audio routes as you need, each with its own input, output, and independent controls.",
  },
  {
    icon: Volume2,
    title: "Per-cable mute",
    body: "Silence any cable instantly without tearing it down. Unmute and audio resumes at exactly the same point.",
  },
  {
    icon: Activity,
    title: "Live VU meter",
    body: "Every cable has a real-time level meter so you can confirm audio is actually flowing before your stream goes live.",
  },
  {
    icon: MonitorSpeaker,
    title: "System tray",
    body: "Runs quietly in the background. Toggle cables, adjust settings, or quit — all from the tray icon.",
  },
  {
    icon: Power,
    title: "One-click toggle",
    body: "Spin cables up and down in a single click. The app remembers your last configuration across restarts.",
  },
  {
    icon: Shield,
    title: "No drivers",
    body: "Works on top of your existing audio setup using PortAudio. No kernel drivers, no signing worries.",
  },
];

function Features() {
  return (
    <section
      id="features"
      className="border-surface-border border-t px-6 py-20"
    >
      <div className="mx-auto max-w-6xl">
        <div className="mb-12 text-center">
          <h2 className="text-3xl font-bold text-white">Everything you need</h2>
          <p className="mt-2 text-zinc-400">
            Simple enough to set up in seconds. Powerful enough for complex
            rigs.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="bg-surface-raised border-surface-border rounded-xl border p-5 transition-colors hover:border-zinc-700"
            >
              <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-lg bg-amber-950/60">
                <Icon size={16} className="text-brand" />
              </div>
              <h3 className="mb-1 font-semibold text-white">{title}</h3>
              <p className="text-sm leading-relaxed text-zinc-400">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── How it works ──────────────────────────────────────────────────────────────

const STEPS = [
  {
    n: "01",
    title: "Pick your input",
    body: 'Select the audio source — a microphone, a virtual device, or any app playing sound — from the "Input" dropdown.',
  },
  {
    n: "02",
    title: "Pick your output",
    body: "Choose where the audio should go: speakers, headphones, a recording app, or another virtual device.",
  },
  {
    n: "03",
    title: "Go live",
    body: "Hit the power button. The cable goes live instantly. Use the mute button or VU meter to monitor the feed.",
  },
];

function HowItWorks() {
  return (
    <section className="border-surface-border border-t px-6 py-20">
      <div className="mx-auto max-w-4xl">
        <div className="mb-12 text-center">
          <h2 className="text-3xl font-bold text-white">Up in 30 seconds</h2>
          <p className="mt-2 text-zinc-400">
            No configuration files, no reboots.
          </p>
        </div>

        <div className="flex flex-col items-start gap-4 sm:flex-row">
          {STEPS.map(({ n, title, body }, i) => (
            <div key={n} className="flex flex-1 flex-col items-start">
              <span className="text-brand mb-3 font-mono text-xs font-bold">
                {n}
              </span>
              <h3 className="mb-2 font-semibold text-white">{title}</h3>
              <p className="text-sm leading-relaxed text-zinc-400">{body}</p>
              {i < STEPS.length - 1 && (
                <ArrowRight
                  size={18}
                  className="mt-4 hidden self-end text-zinc-700 sm:block"
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Download CTA ──────────────────────────────────────────────────────────────

function DownloadCTA() {
  return (
    <section className="border-surface-border border-t px-6 py-20">
      <div className="mx-auto max-w-2xl text-center">
        <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-xl border border-amber-900/40 bg-amber-950/60">
          <Cable size={22} className="text-brand" />
        </div>
        <h2 className="mb-3 text-3xl font-bold text-white">Ready to patch?</h2>
        <p className="mb-7 text-zinc-400">
          Free forever. No account. No telemetry beyond an anonymous install
          count.
        </p>
        <a
          href={DIRECT_DOWNLOAD_URL}
          download
          className="bg-brand hover:bg-brand-dim inline-flex items-center gap-2 rounded-lg px-6 py-3 text-sm font-semibold text-black transition-colors"
        >
          <Download size={16} />
          Download latest release
        </a>
      </div>
    </section>
  );
}

// ── Footer ────────────────────────────────────────────────────────────────────

function Footer() {
  return (
    <footer className="border-surface-border border-t px-6 py-8">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 text-sm text-zinc-600 sm:flex-row">
        <div className="flex items-center gap-2">
          <Cable size={14} className="text-zinc-700" />
          Virtual Cable — MIT License
        </div>
        <div className="flex items-center gap-4">
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 transition-colors hover:text-zinc-400"
          >
            <LuGithub size={14} />
            GitHub
          </a>
          <a
            href={`${GITHUB_URL}/releases`}
            target="_blank"
            rel="noreferrer"
            className="transition-colors hover:text-zinc-400"
          >
            Releases
          </a>
          <a
            href={`${GITHUB_URL}/issues`}
            target="_blank"
            rel="noreferrer"
            className="transition-colors hover:text-zinc-400"
          >
            Issues
          </a>
        </div>
      </div>
    </footer>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <div className="bg-bg min-h-screen text-white">
      <Header />
      <main>
        <Hero />
        <Features />
        <HowItWorks />
        <DownloadCTA />
      </main>
      <Footer />
    </div>
  );
}
