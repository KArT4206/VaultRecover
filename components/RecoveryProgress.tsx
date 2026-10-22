"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, Copy, Download, Loader2 } from "lucide-react";
import { JobStatusBadge } from "./JobStatusBadge";

interface Props {
  jobId: string;
  initialStatus: string;
  initialProgress: number;
  initialCandidates: number;
  initialErrorMessage: string | null;
  initialPassword?: string;
}

const TERMINAL = new Set(["RECOVERED", "FAILED", "CANCELLED", "UNSUPPORTED"]);

export function RecoveryProgress(props: Props) {
  const [status, setStatus] = useState(props.initialStatus);
  const [progress, setProgress] = useState(props.initialProgress);
  const [candidates, setCandidates] = useState(props.initialCandidates);
  const [errorMessage, setErrorMessage] = useState(props.initialErrorMessage);
  const [password, setPassword] = useState(props.initialPassword ?? null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (TERMINAL.has(status)) return;
    const source = new EventSource(`/api/recovery/${props.jobId}/events`);
    source.addEventListener("status", (e) => {
      const data = JSON.parse((e as MessageEvent).data);
      if (data.status) setStatus(data.status);
      if (typeof data.progress === "number") setProgress(data.progress);
      if (typeof data.candidatesTried === "number") setCandidates(data.candidatesTried);
    });
    source.addEventListener("progress", (e) => {
      const data = JSON.parse((e as MessageEvent).data);
      if (typeof data.progress === "number") setProgress(data.progress);
      if (typeof data.candidatesTried === "number") setCandidates(data.candidatesTried);
    });
    source.addEventListener("done", (e) => {
      const data = JSON.parse((e as MessageEvent).data);
      setStatus(data.status);
      source.close();
      if (data.status !== "RECOVERED") {
        fetch(`/api/recovery/${props.jobId}`)
          .then((r) => r.json())
          .then((d) => setErrorMessage(d.errorMessage ?? null))
          .catch(() => {});
      }
    });
    source.onerror = () => {
      source.close();
    };
    return () => source.close();
  }, [props.jobId, status]);

  useEffect(() => {
    if (status === "RECOVERED" && !downloadUrl) {
      fetch(`/api/recovery/${props.jobId}/result`)
        .then((r) => r.json())
        .then((data) => {
          if (data.password) setPassword(data.password);
          if (data.downloadUrl) setDownloadUrl(data.downloadUrl);
        });
    }
  }, [status, downloadUrl, props.jobId]);

  async function cancel() {
    await fetch(`/api/recovery/${props.jobId}/cancel`, { method: "POST" });
    setStatus("CANCELLED");
  }

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <JobStatusBadge status={status} />
        {!TERMINAL.has(status) && (
          <button onClick={cancel} className="text-xs text-graphite-400 hover:text-red-400">
            Cancel
          </button>
        )}
      </div>

      {!TERMINAL.has(status) && (
        <div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-graphite-700">
            <div
              className="h-full bg-accent transition-all"
              style={{ width: `${Math.max(5, progress)}%` }}
            />
          </div>
          <p className="mt-2 flex items-center gap-2 text-xs text-graphite-400">
            <Loader2 className="h-3 w-3 animate-spin" />
            {candidates} candidates tried…
          </p>
        </div>
      )}

      {status === "RECOVERED" && (
        <div className="rounded-md border border-emerald-800 bg-emerald-950/30 p-4">
          <p className="flex items-center gap-2 text-sm font-medium text-emerald-300">
            <CheckCircle2 className="h-4 w-4" /> Password recovered and verified
          </p>
          {password && (
            <div className="mt-3 flex items-center gap-2">
              <code className="flex-1 rounded bg-graphite-800 px-3 py-2 text-sm text-graphite-200">
                {password}
              </code>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(password);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
                className="btn-outline"
              >
                <Copy className="h-4 w-4" />
              </button>
            </div>
          )}
          {copied && <p className="mt-1 text-xs text-accent">Copied</p>}
          {downloadUrl && (
            <a href={downloadUrl} className="btn-accent mt-4 inline-flex gap-2">
              <Download className="h-4 w-4" /> Download unlocked file
            </a>
          )}
        </div>
      )}

      {(status === "FAILED" || status === "UNSUPPORTED" || status === "CANCELLED") && (
        <div className="rounded-md border border-red-900 bg-red-950/20 p-4">
          <p className="flex items-center gap-2 text-sm font-medium text-red-300">
            <XCircle className="h-4 w-4" />
            {status === "CANCELLED" ? "Cancelled" : "Recovery unsuccessful"}
          </p>
          {errorMessage && <p className="mt-2 text-sm text-graphite-400">{errorMessage}</p>}
        </div>
      )}
    </div>
  );
}
