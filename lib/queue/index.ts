import { Queue } from "bullmq";
import { getRedis } from "@/lib/redis";

export const RECOVERY_QUEUE_NAME = "recovery-jobs";
export const CLEANUP_QUEUE_NAME = "cleanup-jobs";

export interface RecoveryJobData {
  jobId: string;
}

let _recoveryQueue: Queue<RecoveryJobData> | undefined;

export function getRecoveryQueue(): Queue<RecoveryJobData> {
  if (!_recoveryQueue) {
    _recoveryQueue = new Queue<RecoveryJobData>(RECOVERY_QUEUE_NAME, {
      connection: getRedis(),
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 100,
        attempts: 1,
      },
    });
  }
  return _recoveryQueue;
}

export function progressChannel(jobId: string): string {
  return `recovery:progress:${jobId}`;
}
