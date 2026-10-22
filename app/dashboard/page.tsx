import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { UploadDropzone } from "@/components/UploadDropzone";
import { JobStatusBadge } from "@/components/JobStatusBadge";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/login");

  const jobs = await prisma.recoveryJob.findMany({
    where: { userId: session.user.id },
    include: { file: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="text-2xl font-semibold text-graphite-200">Dashboard</h1>
      <p className="mt-1 text-sm text-graphite-400">Upload a file to start a free recovery job.</p>

      <div className="mt-6">
        <UploadDropzone />
      </div>

      <h2 className="mt-12 mb-4 text-lg font-semibold text-graphite-200">Your recovery jobs</h2>
      {jobs.length === 0 ? (
        <p className="text-sm text-graphite-400">No jobs yet.</p>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => (
            <Link
              key={job.id}
              href={`/recovery/${job.id}`}
              className="card flex items-center justify-between hover:border-accent"
            >
              <div>
                <p className="font-medium text-graphite-200">{job.file.originalName}</p>
                <p className="text-xs text-graphite-400">
                  {job.file.detectedFormat} · {job.mode} · {new Date(job.createdAt).toLocaleString()}
                </p>
              </div>
              <JobStatusBadge status={job.status} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
