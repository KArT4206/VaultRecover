import { NextRequest } from "next/server";
import IORedis from "ioredis";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { progressChannel } from "@/lib/queue";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Authentication required", { status: 401 });

  const { id } = await params;
  const job = await prisma.recoveryJob.findFirst({ where: { id, userId: session.user.id } });
  if (!job) return new Response("Job not found", { status: 404 });

  const sub = new IORedis(process.env.REDIS_URL || "redis://localhost:6379");
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      // Send current state immediately so late subscribers aren't stuck.
      const current = await prisma.recoveryJob.findUnique({ where: { id }, include: { result: true } });
      if (current) {
        send("status", {
          status: current.status,
          progress: current.progress,
          candidatesTried: current.candidatesTried,
          result: current.result ? { password: current.result.password } : null,
        });
        if (["RECOVERED", "FAILED", "CANCELLED", "UNSUPPORTED"].includes(current.status)) {
          send("done", { status: current.status });
          controller.close();
          return;
        }
      }

      await sub.subscribe(progressChannel(id));
      sub.on("message", (_channel, message) => {
        try {
          const parsed = JSON.parse(message);
          send(parsed.event ?? "status", parsed);
          if (parsed.event === "done") {
            controller.close();
          }
        } catch {
          // ignore malformed message
        }
      });

      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: heartbeat\n\n`));
        } catch {
          clearInterval(heartbeat);
        }
      }, 15000);

      req.signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
        sub.disconnect();
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
    cancel() {
      sub.disconnect();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
