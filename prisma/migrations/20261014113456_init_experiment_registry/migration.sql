-- CreateTable
CREATE TABLE "public"."Experiment" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hypothesis" TEXT NOT NULL,
    "agent" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "code_version" TEXT NOT NULL,
    "data_version" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "metrics" JSONB,
    "artifacts" JSONB,
    "parent_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(3),
    "approved_by" TEXT,
    "approved_at" TIMESTAMPTZ(3),

    PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Experiment_agent_status_idx" ON "public"."Experiment"("agent", "status");

-- CreateIndex
CREATE INDEX "Experiment_created_at_idx" ON "public"."Experiment"("created_at");

-- CreateIndex
CREATE INDEX "Experiment_status_idx" ON "public"."Experiment"("status");
