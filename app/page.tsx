import Link from "next/link";
import { ShieldCheck, Zap, KeyRound, FileLock2, CheckCircle2 } from "lucide-react";

const FORMATS = [
  { slug: "pdf", label: "PDF", live: true },
  { slug: "zip", label: "ZIP", live: true },
  { slug: "rar", label: "RAR", live: false },
  { slug: "7z", label: "7Z", live: false },
  { slug: "word", label: "Word", live: false },
  { slug: "excel", label: "Excel", live: false },
  { slug: "powerpoint", label: "PowerPoint", live: false },
];

export default function HomePage() {
  return (
    <div>
      <section className="mx-auto max-w-6xl px-4 pb-16 pt-20 text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-graphite-600 px-3 py-1 text-xs text-accent">
          100% free — no plans, no payment, ever
        </span>
        <h1 className="mt-6 text-4xl font-bold tracking-tight text-graphite-200 sm:text-5xl">
          Locked out of your own file?
          <br />
          <span className="text-accent">Recover the password, for real.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-graphite-400">
          VaultRecover actually opens and verifies your ZIP and PDF files against real candidate
          passwords — no fake progress bars, no guessing games. If we say recovered, it&apos;s
          because we decrypted it.
        </p>
        <div className="mt-8 flex justify-center gap-4">
          <Link href="/auth/register" className="btn-accent px-6 py-3 text-base">Start recovering — free</Link>
          <Link href="/how-it-works" className="btn-outline px-6 py-3 text-base">How it works</Link>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12">
        <div className="grid gap-6 md:grid-cols-3">
          <div className="card">
            <Zap className="mb-3 h-6 w-6 text-accent" />
            <h3 className="font-semibold text-graphite-200">Fast Check</h3>
            <p className="mt-2 text-sm text-graphite-400">
              Automatically tries common passwords the moment you upload — often solved in
              seconds.
            </p>
          </div>
          <div className="card">
            <KeyRound className="mb-3 h-6 w-6 text-accent" />
            <h3 className="font-semibold text-graphite-200">Deep Recovery</h3>
            <p className="mt-2 text-sm text-graphite-400">
              Give hints — words you might have used — and we generate real mutations and
              patterns to test against your file.
            </p>
          </div>
          <div className="card">
            <ShieldCheck className="mb-3 h-6 w-6 text-accent" />
            <h3 className="font-semibold text-graphite-200">Verified, not guessed</h3>
            <p className="mt-2 text-sm text-graphite-400">
              Every candidate is checked against your actual file&apos;s real encryption. Files
              auto-delete after a short retention window.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12">
        <h2 className="text-center text-2xl font-semibold text-graphite-200">Supported file types</h2>
        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4 md:grid-cols-7">
          {FORMATS.map((f) => (
            <Link
              key={f.slug}
              href={`/file-types/${f.slug}`}
              className="card flex flex-col items-center gap-2 py-6 text-center hover:border-accent"
            >
              <FileLock2 className="h-6 w-6 text-graphite-400" />
              <span className="text-sm font-medium text-graphite-200">{f.label}</span>
              {f.live ? (
                <span className="flex items-center gap-1 text-xs text-accent">
                  <CheckCircle2 className="h-3 w-3" /> Live recovery
                </span>
              ) : (
                <span className="text-xs text-graphite-400">Coming soon</span>
              )}
            </Link>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h2 className="text-2xl font-semibold text-graphite-200">No pricing page. That&apos;s the point.</h2>
        <p className="mt-3 text-graphite-400">
          VaultRecover has no payment system anywhere in the product. Usage is kept fair with
          simple technical limits (file size, concurrent jobs, daily jobs) instead of a paywall.
        </p>
      </section>
    </div>
  );
}
