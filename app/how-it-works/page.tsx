const STEPS = [
  { title: "1. Upload", body: "Your file is validated by real content (magic bytes), not just its extension, and stored under a random key — never your original filename." },
  { title: "2. Analyze", body: "We inspect the file's real structure to confirm it's actually password-protected and detect the encryption scheme." },
  { title: "3. Recover", body: "Fast Check tries common passwords immediately. Deep Recovery uses your hints to generate targeted candidates. Every candidate is verified by actually decrypting your file." },
  { title: "4. Reveal & download", body: "On success, the password is shown and a short-lived, signed link lets you download the unlocked file. Files are deleted automatically after a short retention window." },
];

export default function HowItWorksPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="text-3xl font-semibold text-graphite-200">How VaultRecover works</h1>
      <div className="mt-8 space-y-6">
        {STEPS.map((s) => (
          <div key={s.title} className="card">
            <h2 className="font-semibold text-accent">{s.title}</h2>
            <p className="mt-2 text-sm text-graphite-400">{s.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
