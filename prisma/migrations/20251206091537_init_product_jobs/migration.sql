-- CreateTable
CREATE TABLE "ProductJob" (
    "id" TEXT NOT NULL,
    "enterpriseId" TEXT,
    "createdByUserId" TEXT,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "payload" JSONB,
    "totalItems" INTEGER NOT NULL DEFAULT 0,
    "processedItems" INTEGER NOT NULL DEFAULT 0,
    "failedItems" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "ProductJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductJobItem" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "sellerId" TEXT,
    "profileId" TEXT,
    "offerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "inputSnapshot" JSONB,
    "resultSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "ProductJobItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductJob_status_createdAt_idx" ON "ProductJob"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ProductJob_enterpriseId_type_idx" ON "ProductJob"("enterpriseId", "type");

-- CreateIndex
CREATE INDEX "ProductJobItem_jobId_status_idx" ON "ProductJobItem"("jobId", "status");

-- CreateIndex
CREATE INDEX "ProductJobItem_status_createdAt_idx" ON "ProductJobItem"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ProductJobItem_sellerId_offerId_idx" ON "ProductJobItem"("sellerId", "offerId");

-- AddForeignKey
ALTER TABLE "ProductJobItem" ADD CONSTRAINT "ProductJobItem_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ProductJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
