-- AlterTable
ALTER TABLE "RecoveryJob" ADD COLUMN     "workerId" TEXT;

-- AlterTable
ALTER TABLE "Worker" ADD COLUMN     "gpuInfo" TEXT,
ADD COLUMN     "hasGpu" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'CPU';
