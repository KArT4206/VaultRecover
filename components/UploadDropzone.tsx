"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud, CheckCircle2, XCircle, Info } from "lucide-react";

const ONLINE = process.env.NEXT_PUBLIC_DEPLOY_TARGET === "vercel";

type OnlineResult =
  | { kind: "success"; password: string; strategy: string; candidatesTried: number }
  | { kind: "notfound"; candidatesTried: number; exhausted: boolean }
  | { kind: "local"; message: string };

export function UploadDropzone() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OnlineResult | null>(null);
  const [mode, setMode] = useState<"FAST_CHECK" | "DEEP_RECOVERY">("FAST_CHECK");
  const [hints, setHints] = useState("");

  const hintWords = hints.trim()
    ? { knownWords: hints.split(",").map((w) => w.trim()).filter(Boolean) }
    : undefined;

  async function handleFileLocal(file: File) {
    const form = new FormData();
    form.append("file", file);
    const uploadRes = await fetch("/api/files/upload", { method: "POST", body: form });
    const uploadData = await uploadRes.json();
    if (!uploadRes.ok) throw new Error(uploadData.error || "Upload failed");

    const createRes = await fetch("/api/recovery/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileId: uploadData.fileId, mode, hints: hintWords }),
    });
    const createData = await createRes.json();
    if (!createRes.ok) throw new Error(createData.error || "Could not start recovery");
    router.push(`/recovery/${createData.jobId}`);
  }

  async function handleFileOnline(file: File) {
    const form = new FormData();
    form.append("file", file);
    form.append("mode", mode);
    if (hintWords) form.append("hints", JSON.stringify(hintWords));
    const res = await fetch("/api/recovery/online", { method: "POST", body: form });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Recovery failed");
    if (data.localOnly) setResult({ kind: "local", message: data.message });
    else if (data.success) setResult({ kind: "success", password: data.password, strategy: data.strategy, candidatesTried: data.candidatesTried });
    else setResult({ kind: "notfound", candidatesTried: data.candidatesTried, exhausted: data.exhausted });
    router.refresh();
  }

  async function handleFile(file: File) {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      if (ONLINE) await handleFileOnline(file);
      else await handleFileLocal(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-2 text-graphite-400">
          <input type="radio" checked={mode === "FAST_CHECK"} onChange={() => setMode("FAST_CHECK")} />
          Fast Check (common passwords)
        </label>
        <label className="flex items-center gap-2 text-graphite-400">
          <input type="radio" checked={mode === "DEEP_RECOVERY"} onChange={() => setMode("DEEP_RECOVERY")} />
          Deep Recovery (use hints)
        </label>
      </div>

      {mode === "DEEP_RECOVERY" && (
        <input
          className="input"
          placeholder="Hint words, comma-separated (e.g. mydog, birthday2020)"
          value={hints}
          onChange={(e) => setHints(e.target.value)}
        />
      )}

      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) handleFile(file);
        }}
        onClick={() => inputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-10 text-center transition ${
          dragging ? "border-accent bg-graphite-800" : "border-graphite-600"
        }`}
      >
        <UploadCloud className="h-8 w-8 text-graphite-400" />
        <p className="text-sm text-graphite-200">
          {busy
            ? ONLINE ? "Verifying passwords against your file…" : "Uploading and starting recovery…"
            : ONLINE ? "Drag & drop a ZIP here, or click to browse" : "Drag & drop a ZIP or PDF here, or click to browse"}
        </p>
        <p className="text-xs text-graphite-400">
          {ONLINE
            ? "ZIP recovery runs in your browser session against the real file. Nothing is kept after the attempt."
            : "Files are processed locally and auto-deleted after retention."}
        </p>
        <input
          ref={inputRef}
          type="file"
          accept={ONLINE ? ".zip" : ".zip,.pdf,.rar,.7z,.doc,.docx,.xls,.xlsx,.ppt,.pptx"}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {result?.kind === "success" && (
        <div className="card border-emerald-700/60 bg-emerald-950/20">
          <div className="flex items-center gap-2 text-emerald-300">
            <CheckCircle2 className="h-5 w-5" /> <span className="font-semibold">Password recovered</span>
          </div>
          <p className="mt-2 font-mono text-lg text-graphite-100 break-all">{result.password}</p>
          <p className="mt-1 text-xs text-graphite-400">
            Found by “{result.strategy}” after {result.candidatesTried.toLocaleString()} verified candidates.
          </p>
        </div>
      )}
      {result?.kind === "notfound" && (
        <div className="card border-graphite-600">
          <div className="flex items-center gap-2 text-graphite-200">
            <XCircle className="h-5 w-5 text-graphite-400" /> <span className="font-semibold">No match yet</span>
          </div>
          <p className="mt-1 text-xs text-graphite-400">
            Tried {result.candidatesTried.toLocaleString()} candidates
            {result.exhausted ? " (list exhausted)" : " (online time budget reached)"}. Add hint words with Deep Recovery, or run VaultRecover locally for a longer search.
          </p>
        </div>
      )}
      {result?.kind === "local" && (
        <div className="card border-amber-700/50 bg-amber-950/20">
          <div className="flex items-center gap-2 text-amber-300">
            <Info className="h-5 w-5" /> <span className="font-semibold">Runs locally</span>
          </div>
          <p className="mt-1 text-xs text-graphite-400">{result.message}</p>
        </div>
      )}
    </div>
  );
}
