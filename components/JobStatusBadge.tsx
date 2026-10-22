const COLORS: Record<string, string> = {
  PENDING: "bg-graphite-700 text-graphite-200",
  ANALYZING: "bg-graphite-700 text-graphite-200",
  QUEUED: "bg-graphite-700 text-graphite-200",
  RUNNING: "bg-yellow-900/40 text-yellow-300",
  RECOVERED: "bg-emerald-900/40 text-emerald-300",
  FAILED: "bg-red-900/40 text-red-300",
  CANCELLED: "bg-graphite-700 text-graphite-400",
  UNSUPPORTED: "bg-graphite-700 text-graphite-400",
};

export function JobStatusBadge({ status }: { status: string }) {
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-medium ${COLORS[status] ?? COLORS.PENDING}`}>
      {status}
    </span>
  );
}
