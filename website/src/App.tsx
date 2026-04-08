import {
  Cable,
  Download,
  Github,
  Power,
  Volume2,
  VolumeX,
  Layers,
  Activity,
  MonitorSpeaker,
  ArrowRight,
  Zap,
  Shield,
} from "lucide-react";

const GITHUB_URL = "https://github.com/JulianSpeckmann/virtual-cable";
const RELEASES_URL = `${GITHUB_URL}/releases/latest`;

// ── Header ────────────────────────────────────────────────────────────────────

function Header() {
  return (
    <header className="fixed top-0 inset-x-0 z-50 border-b border-surface-border bg-[#0c0b09]/80 backdrop-blur-md">
      <div className="mx-auto max-w-6xl px-6 flex items-center justify-between h-14">
        <div className="flex items-center gap-2 font-semibold text-white">
          <Cable size={18} className="text-brand" />
          Virtual Cable
        </div>
        <nav className="flex items-center gap-3">
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white transition-colors"
          >
            <Github size={15} />
            GitHub
          </a>
          <a
            href={RELEASES_URL}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 text-sm bg-brand hover:bg-brand-dim text-black font-medium px-3 py-1.5 rounded-md transition-colors"
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
    <div className="flex items-center gap-0 my-10">
      {/* Jack plug */}
      <div className="w-3 h-3 rounded-full bg-brand shadow-[0_0_12px_#f59e0b]" />
      {/* Cable track */}
      <div className="relative h-1 w-48 bg-surface-raised rounded-full overflow-hidden">
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
      <div className="w-3 h-3 rounded-full bg-brand shadow-[0_0_12px_#f59e0b]" />
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
    <section className="pt-32 pb-24 px-6 text-center">
      <div className="mx-auto max-w-3xl">
        <div className="inline-flex items-center gap-2 text-xs font-medium text-brand bg-amber-950/40 border border-amber-900/40 rounded-full px-3 py-1 mb-6">
          <Zap size={11} />
          Free &amp; open source
        </div>

        <h1 className="text-5xl sm:text-6xl font-bold tracking-tight text-white leading-tight">
          Route audio
          <br />
          <span className="text-brand">anywhere.</span>
        </h1>

        <p className="mt-5 text-lg text-zinc-400 max-w-xl mx-auto leading-relaxed">
          Virtual Cable lets you patch any audio source to any destination on
          your PC — no drivers, no fuss. Built for streamers, podcasters, and
          producers.
        </p>

        <div className="flex justify-center">
          <CableAnimation />
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <a
            href={RELEASES_URL}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 bg-brand hover:bg-brand-dim text-black font-semibold px-5 py-2.5 rounded-lg transition-colors"
          >
            <Download size={16} />
            Download for Windows
          </a>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 text-zinc-300 hover:text-white border border-surface-border hover:border-zinc-600 px-5 py-2.5 rounded-lg transition-colors"
          >
            <Github size={16} />
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
      className="py-20 px-6 border-t border-surface-border"
    >
      <div className="mx-auto max-w-6xl">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-white">Everything you need</h2>
          <p className="mt-2 text-zinc-400">
            Simple enough to set up in seconds. Powerful enough for complex
            rigs.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="bg-surface-raised border border-surface-border rounded-xl p-5 hover:border-zinc-700 transition-colors"
            >
              <div className="w-8 h-8 rounded-lg bg-amber-950/60 flex items-center justify-center mb-3">
                <Icon size={16} className="text-brand" />
              </div>
              <h3 className="font-semibold text-white mb-1">{title}</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">{body}</p>
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
    <section className="py-20 px-6 border-t border-surface-border">
      <div className="mx-auto max-w-4xl">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-white">Up in 30 seconds</h2>
          <p className="mt-2 text-zinc-400">
            No configuration files, no reboots.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 items-start">
          {STEPS.map(({ n, title, body }, i) => (
            <div key={n} className="flex-1 flex flex-col items-start">
              <span className="text-xs font-mono font-bold text-brand mb-3">
                {n}
              </span>
              <h3 className="font-semibold text-white mb-2">{title}</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">{body}</p>
              {i < STEPS.length - 1 && (
                <ArrowRight
                  size={18}
                  className="hidden sm:block text-zinc-700 mt-4 self-end"
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
    <section className="py-20 px-6 border-t border-surface-border">
      <div className="mx-auto max-w-2xl text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-amber-950/60 border border-amber-900/40 mb-5">
          <Cable size={22} className="text-brand" />
        </div>
        <h2 className="text-3xl font-bold text-white mb-3">Ready to patch?</h2>
        <p className="text-zinc-400 mb-7">
          Free forever. No account. No telemetry beyond an anonymous install
          count.
        </p>
        <a
          href={RELEASES_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 bg-brand hover:bg-brand-dim text-black font-semibold px-6 py-3 rounded-lg transition-colors text-sm"
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
    <footer className="border-t border-surface-border py-8 px-6">
      <div className="mx-auto max-w-6xl flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-zinc-600">
        <div className="flex items-center gap-2">
          <Cable size={14} className="text-zinc-700" />
          Virtual Cable — MIT License
        </div>
        <div className="flex items-center gap-4">
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 hover:text-zinc-400 transition-colors"
          >
            <Github size={14} />
            GitHub
          </a>
          <a
            href={`${GITHUB_URL}/releases`}
            target="_blank"
            rel="noreferrer"
            className="hover:text-zinc-400 transition-colors"
          >
            Releases
          </a>
          <a
            href={`${GITHUB_URL}/issues`}
            target="_blank"
            rel="noreferrer"
            className="hover:text-zinc-400 transition-colors"
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
    <div className="min-h-screen bg-[#0c0b09] text-white">
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
