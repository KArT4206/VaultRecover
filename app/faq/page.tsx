const FAQS = [
  { q: "Is VaultRecover really free?", a: "Yes. There is no payment system anywhere in the app. Fair use is enforced with simple technical limits (file size, concurrent jobs, daily jobs) instead of a paywall." },
  { q: "What file types can be recovered right now?", a: "ZIP and PDF passwords are recovered with real, verified decryption. RAR, 7Z, and Office formats have informational pages but automated recovery isn't wired up for them yet." },
  { q: "Is my file kept private?", a: "Files are stored under random, non-guessable keys, never processed by anyone but the automated worker, and deleted automatically after a short retention window." },
  { q: "What if the password can't be found?", a: "If no candidate in the available strategies verifies against your file, the job ends as Failed — we never report a false success." },
  { q: "Can I supply hints?", a: "Yes — Deep Recovery mode lets you provide words you might have used; we generate mutations and patterns from them." },
];

export default function FaqPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="text-3xl font-semibold text-graphite-200">Frequently asked questions</h1>
      <div className="mt-8 space-y-6">
        {FAQS.map((f) => (
          <div key={f.q}>
            <h2 className="font-medium text-graphite-200">{f.q}</h2>
            <p className="mt-1 text-sm text-graphite-400">{f.a}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
