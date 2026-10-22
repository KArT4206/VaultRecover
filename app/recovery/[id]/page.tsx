import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { RecoveryProgress } from "@/components/RecoveryProgress";

export default async function RecoveryPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/login");

  const { id } = await params;
  const job = await prisma.recoveryJob.findFirst({
    where: { id, userId: session.user.id },
    include: { file: true, result: true },
  });
  if (!job) redirect("/dashboard");

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-2xl font-semibold text-graphite-200">{job.file.originalName}</h1>
      <p className="mt-1 text-sm text-graphite-400">
        {job.file.detectedFormat} · {job.mode.replace("_", " ")}
      </p>

      <div className="mt-6">
        <RecoveryProgress
          jobId={job.id}
          initialStatus={job.status}
          initialProgress={job.progress}
          initialCandidates={job.candidatesTried}
          initialErrorMessage={job.errorMessage}
          initialPassword={job.result?.password}
        />
      </div>
    </div>
  );
}
