import {
  BackupRestoreDrillExecutionResponseSchema,
  BackupRestoreDrillPlanSchema,
  MigrationDeploymentGatePlanSchema,
  type BackupRestoreDrillPlan,
  type MigrationDeploymentGatePlan,
} from "@searchops/types";

import { apiFetch } from "./api-client";
import { getApiBaseUrl } from "./api-base-url";

export type OperationsHardeningSource = "api" | "fixture";
export type BackupRestoreDrillRunStatus =
  | "accepted"
  | "blocked"
  | "dry_run"
  | "failed"
  | "fixture";

export interface OperationsHardeningDashboard {
  readonly backupRestorePlan: BackupRestoreDrillPlan;
  readonly errorMessage: string | null;
  readonly migrationGatePlan: MigrationDeploymentGatePlan;
  readonly source: OperationsHardeningSource;
  readonly summary: OperationsHardeningSummary;
}

export interface OperationsHardeningSummary {
  readonly migrationSteps: number;
  readonly requiredInputs: number;
  readonly restoreSteps: number;
}

export interface BackupRestoreDrillRunResult {
  readonly dispatchStatus: string | null;
  readonly errorMessage: string | null;
  readonly planId: string | null;
  readonly source: OperationsHardeningSource;
  readonly status: BackupRestoreDrillRunStatus;
}

export const demoBackupRestoreDrillPlan = BackupRestoreDrillPlanSchema.parse({
  id: "restore_drill_production_fixture",
  environment: "production",
  createdAt: "2026-05-26T00:00:00.000Z",
  requiredInputs: ["DATABASE_URL", "RESTORE_DATABASE_URL", "private backup destination"],
  status: "ready",
  steps: [
    {
      id: "preflight_migration_status",
      title: "Check migration status",
      description: "Confirm Prisma migration status before backup or restore.",
      command: "corepack pnpm db:migrate:status",
      status: "ready",
    },
    {
      id: "create_backup",
      title: "Create PostgreSQL backup",
      description: "Create a custom-format PostgreSQL dump.",
      command:
        'pg_dump --format=custom --no-owner --no-acl "$DATABASE_URL" --file searchops-YYYYMMDD-HHMM.dump',
      status: "ready",
    },
    {
      id: "restore_scratch",
      title: "Restore into scratch database",
      description: "Restore into an isolated scratch database.",
      command:
        'pg_restore --clean --if-exists --no-owner --dbname "$RESTORE_DATABASE_URL" searchops-YYYYMMDD-HHMM.dump',
      status: "ready",
    },
    {
      id: "verify_restore",
      title: "Verify restored database",
      description: "Run migration status and read-only smoke checks against the restored database.",
      command: "corepack pnpm db:migrate:status",
      status: "ready",
    },
  ],
});

export const demoMigrationDeploymentGatePlan = MigrationDeploymentGatePlanSchema.parse({
  id: "migration_gate_production_fixture",
  environment: "production",
  createdAt: "2026-05-26T00:00:00.000Z",
  requiredInputs: [
    "DATABASE_URL",
    "packages/db/prisma/schema.prisma",
    "packages/db/prisma/migrations",
  ],
  status: "ready",
  steps: [
    {
      id: "generate_client",
      title: "Generate Prisma client",
      description: "Regenerate the Prisma client from the checked-in schema.",
      command: "corepack pnpm --filter @searchops/db db:generate",
      status: "ready",
    },
    {
      id: "preflight_migration_status",
      title: "Check migration status",
      description: "Confirm the target database and migrations are deployable.",
      command: "corepack pnpm db:migrate:status",
      status: "ready",
    },
    {
      id: "deploy_migrations",
      title: "Deploy migrations",
      description: "Apply checked-in migrations through Prisma migrate deploy.",
      command: "corepack pnpm db:migrate:deploy",
      status: "ready",
    },
    {
      id: "postdeploy_migration_status",
      title: "Verify migration status after deploy",
      description: "Confirm no pending, failed, or divergent migrations remain.",
      command: "corepack pnpm db:migrate:status",
      status: "ready",
    },
  ],
});

export async function loadOperationsHardeningDashboard(
  environment = "production",
): Promise<OperationsHardeningDashboard> {
  const apiBaseUrl = getApiBaseUrl();
  if (apiBaseUrl === null) {
    return createDemoOperationsHardeningDashboard();
  }

  try {
    const [backupRestorePlan, migrationGatePlan] = await Promise.all([
      fetchPlan(
        `${apiBaseUrl}/ops/backup-restore-drill-plan?environment=${encodeURIComponent(environment)}`,
        BackupRestoreDrillPlanSchema,
      ),
      fetchPlan(
        `${apiBaseUrl}/ops/migration-deployment-gate-plan?environment=${encodeURIComponent(environment)}`,
        MigrationDeploymentGatePlanSchema,
      ),
    ]);

    return {
      backupRestorePlan,
      errorMessage: null,
      migrationGatePlan,
      source: "api",
      summary: summarizeOperationsHardening(backupRestorePlan, migrationGatePlan),
    };
  } catch (error) {
    return {
      ...createDemoOperationsHardeningDashboard(),
      errorMessage:
        error instanceof Error ? error.message : "운영 hardening 계획 조회에 실패했습니다",
    };
  }
}

export async function runBackupRestoreDrill(input: {
  readonly dryRun: boolean;
  readonly environment: string;
}): Promise<BackupRestoreDrillRunResult> {
  const apiBaseUrl = getApiBaseUrl();
  if (apiBaseUrl === null) {
    return {
      dispatchStatus: "dry_run",
      errorMessage: null,
      planId: demoBackupRestoreDrillPlan.id,
      source: "fixture",
      status: "fixture",
    };
  }

  try {
    const response = await apiFetch(`${apiBaseUrl}/ops/backup-restore-drill-runs`, {
      body: JSON.stringify(input),
      cache: "no-store",
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
    });
    if (!response.ok) {
      throw new Error(`restore drill 실행 요청 실패: ${response.status}`);
    }

    const output = BackupRestoreDrillExecutionResponseSchema.parse(await response.json());
    return {
      dispatchStatus: output.dispatch.status,
      errorMessage: null,
      planId: output.plan.id,
      source: "api",
      status: output.dispatch.status,
    };
  } catch (error) {
    return {
      dispatchStatus: null,
      errorMessage:
        error instanceof Error ? error.message : "restore drill 실행 요청에 실패했습니다",
      planId: null,
      source: "api",
      status: "failed",
    };
  }
}

export function createDemoOperationsHardeningDashboard(): OperationsHardeningDashboard {
  return {
    backupRestorePlan: demoBackupRestoreDrillPlan,
    errorMessage: null,
    migrationGatePlan: demoMigrationDeploymentGatePlan,
    source: "fixture",
    summary: summarizeOperationsHardening(
      demoBackupRestoreDrillPlan,
      demoMigrationDeploymentGatePlan,
    ),
  };
}

export function summarizeOperationsHardening(
  backupRestorePlan: BackupRestoreDrillPlan,
  migrationGatePlan: MigrationDeploymentGatePlan,
): OperationsHardeningSummary {
  return {
    migrationSteps: migrationGatePlan.steps.length,
    requiredInputs: new Set([
      ...backupRestorePlan.requiredInputs,
      ...migrationGatePlan.requiredInputs,
    ]).size,
    restoreSteps: backupRestorePlan.steps.length,
  };
}

export function getBackupRestoreDrillRunFeedback(
  status: string | undefined,
  planId: string | undefined,
): { readonly message: string; readonly tone: "info" | "success" | "warning" } | null {
  if (status === "accepted") {
    return {
      message: planId
        ? `restore drill 실행을 dispatch했습니다: ${planId}`
        : "restore drill 실행을 dispatch했습니다.",
      tone: "success",
    };
  }

  if (status === "dry_run" || status === "fixture") {
    return {
      message: planId
        ? `restore drill dry-run을 확인했습니다: ${planId}`
        : "restore drill dry-run을 확인했습니다.",
      tone: "info",
    };
  }

  if (status === "blocked") {
    return {
      message: "restore drill executor가 구성되지 않았거나 실행 조건이 충족되지 않았습니다.",
      tone: "warning",
    };
  }

  if (status === "failed") {
    return {
      message: "restore drill 실행 요청에 실패했습니다. API 서버와 scheduler 설정을 확인하세요.",
      tone: "warning",
    };
  }

  return null;
}

function fetchPlan<T>(
  url: string,
  schema: { parse(input: unknown): T },
): Promise<T> {
  return apiFetch(url, { cache: "no-store" }).then(async (response) => {
    if (!response.ok) {
      throw new Error(`운영 hardening 계획 요청 실패: ${response.status}`);
    }

    return schema.parse(await response.json());
  });
}
