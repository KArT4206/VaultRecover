-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "FileFormat" AS ENUM ('PDF', 'ZIP', 'RAR', 'SEVEN_Z', 'WORD', 'EXCEL', 'POWERPOINT', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'ANALYZING', 'QUEUED', 'RUNNING', 'RECOVERED', 'FAILED', 'CANCELLED', 'UNSUPPORTED');

-- CreateEnum
CREATE TYPE "RecoveryMode" AS ENUM ('FAST_CHECK', 'DEEP_RECOVERY', 'LEGACY');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "name" TEXT,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "File" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "detectedFormat" "FileFormat" NOT NULL DEFAULT 'UNKNOWN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "File_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FileAnalysis" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "format" "FileFormat" NOT NULL,
    "isEncrypted" BOOLEAN NOT NULL,
    "encryptionType" TEXT,
    "entryCount" INTEGER,
    "uncompressedSize" BIGINT,
    "recoverySupported" BOOLEAN NOT NULL DEFAULT false,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FileAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecoveryJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "mode" "RecoveryMode" NOT NULL DEFAULT 'FAST_CHECK',
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "hints" JSONB,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "candidatesTried" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "runtimeMs" INTEGER,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecoveryJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecoveryStrategyLog" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "strategy" TEXT NOT NULL,
    "candidatesTried" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "outcome" TEXT,

    CONSTRAINT "RecoveryStrategyLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecoveryResult" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "strategy" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resultObjectKey" TEXT,

    CONSTRAINT "RecoveryResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Download" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "downloadedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Download_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Worker" (
    "id" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'idle',
    "lastHeartbeat" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activeJobId" TEXT,

    CONSTRAINT "Worker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "SecurityEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "type" TEXT NOT NULL,
    "detail" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecurityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "metadata" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "File_objectKey_key" ON "File"("objectKey");

-- CreateIndex
CREATE INDEX "File_userId_idx" ON "File"("userId");

-- CreateIndex
CREATE INDEX "File_sha256_idx" ON "File"("sha256");

-- CreateIndex
CREATE UNIQUE INDEX "FileAnalysis_fileId_key" ON "FileAnalysis"("fileId");

-- CreateIndex
CREATE INDEX "RecoveryJob_userId_idx" ON "RecoveryJob"("userId");

-- CreateIndex
CREATE INDEX "RecoveryJob_status_idx" ON "RecoveryJob"("status");

-- CreateIndex
CREATE INDEX "RecoveryStrategyLog_jobId_idx" ON "RecoveryStrategyLog"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "RecoveryResult_jobId_key" ON "RecoveryResult"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "Download_token_key" ON "Download"("token");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "File" ADD CONSTRAINT "File_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileAnalysis" ADD CONSTRAINT "FileAnalysis_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "File"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecoveryJob" ADD CONSTRAINT "RecoveryJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecoveryJob" ADD CONSTRAINT "RecoveryJob_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "File"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecoveryStrategyLog" ADD CONSTRAINT "RecoveryStrategyLog_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "RecoveryJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecoveryResult" ADD CONSTRAINT "RecoveryResult_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "RecoveryJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Download" ADD CONSTRAINT "Download_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "RecoveryJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecurityEvent" ADD CONSTRAINT "SecurityEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
