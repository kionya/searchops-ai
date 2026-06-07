import { describe, expect, it } from "vitest";

import type { DeadLetterJobRecord } from "@searchops/types";

import {
  createHttpBackupRestoreDrillScheduler,
  createMemoryOperationsExecutor,
  createBackupRestoreDrillPlan,
  createDeadLetterReplayPlan,
  createMigrationDeploymentGatePlan,
  createSecretRotationPlan,
  executeBackupRestoreDrill,
  executeSecretRotation,
} from "./operations-hardening.js";

const createdAt = new Date("2026-05-26T00:00:00.000Z");

const deadLetterJob: DeadLetterJobRecord = {
  id: "searchops-crawl-dead-letter|42",
  queueName: "searchops-crawl-dead-letter",
  jobId: "42",
  status: "waiting",
  enqueuedAt: "2026-05-25T00:00:01.000Z",
  processedAt: null,
  payload: {
    originalQueue: "searchops-crawl",
    originalJobName: "crawl",
    originalJobId: "job_42",
    failedReason: "Fetch timed out",
    attemptsMade: 3,
    failedAt: "2026-05-25T00:00:00.000Z",
  },
};

describe("operations hardening plans", () => {
  it("creates a deterministic backup restore drill plan", () => {
    expect(
      createBackupRestoreDrillPlan({
        createdAt,
        environment: "production",
      }),
    ).toMatchObject({
      id: "restore_drill_production_20260526",
      environment: "production",
      status: "ready",
      requiredInputs: ["DATABASE_URL", "RESTORE_DATABASE_URL", "private backup destination"],
      steps: [
        {
          id: "preflight_migration_status",
          command: "corepack pnpm db:migrate:status",
        },
        {
          id: "create_backup",
        },
        {
          id: "restore_scratch",
        },
        {
          id: "verify_restore",
        },
      ],
    });
  });

  it("creates a deterministic migration deployment gate plan", () => {
    expect(
      createMigrationDeploymentGatePlan({
        createdAt,
        environment: "production",
      }),
    ).toMatchObject({
      id: "migration_gate_production_20260526",
      environment: "production",
      status: "ready",
      requiredInputs: [
        "DATABASE_URL",
        "packages/db/prisma/schema.prisma",
        "packages/db/prisma/migrations",
      ],
      steps: [
        {
          id: "generate_client",
          command: "corepack pnpm --filter @searchops/db db:generate",
        },
        {
          id: "preflight_migration_status",
          command: "corepack pnpm db:migrate:status",
        },
        {
          id: "deploy_migrations",
          command: "corepack pnpm db:migrate:deploy",
        },
        {
          id: "postdeploy_migration_status",
          command: "corepack pnpm db:migrate:status",
        },
      ],
    });
  });

  it("creates a secret rotation plan without exposing secret values", () => {
    const plan = createSecretRotationPlan({
      createdAt,
      provider: "wordpress",
      oldSecretRef: "cms/wordpress/old",
      newSecretRef: "cms/wordpress/new",
      verificationEvent: "signed WordPress webhook fixture",
    });

    expect(plan).toMatchObject({
      id: "secret_rotation_wordpress_20260526",
      provider: "wordpress",
      status: "ready",
      verificationEvent: "signed WordPress webhook fixture",
    });
    expect(JSON.stringify(plan)).not.toContain("secret_value");
  });

  it("blocks rotation plans when secret references are identical", () => {
    expect(
      createSecretRotationPlan({
        createdAt,
        provider: "webflow",
        oldSecretRef: "cms/webflow/current",
        newSecretRef: "cms/webflow/current",
      }),
    ).toMatchObject({
      status: "blocked",
      steps: expect.arrayContaining([
        expect.objectContaining({
          id: "retire_old_secret",
          status: "blocked",
        }),
      ]),
    });
  });

  it("creates a dead-letter replay workflow that requires queue-specific reconstruction", () => {
    expect(
      createDeadLetterReplayPlan({
        createdAt,
        job: deadLetterJob,
      }),
    ).toMatchObject({
      id: "dead_letter_replay_searchops_crawl_dead_letter_42_20260526",
      deadLetterJobId: deadLetterJob.id,
      originalQueue: "searchops-crawl",
      originalJobName: "crawl",
      originalJobId: "job_42",
      status: "blocked",
      steps: [
        {
          id: "inspect_failure",
          status: "ready",
        },
        {
          id: "reconstruct_payload",
          status: "blocked",
        },
        {
          id: "enqueue_replay",
          status: "blocked",
        },
      ],
    });
  });

  it("executes restore drill and secret rotation dispatches through an executor", async () => {
    const executor = createMemoryOperationsExecutor(
      () => new Date("2026-05-26T00:01:00.000Z"),
    );
    const restoreRun = await executeBackupRestoreDrill({
      createdAt,
      request: {
        dryRun: false,
        environment: "production",
      },
      scheduler: executor,
    });
    const rotationRun = await executeSecretRotation({
      createdAt,
      executor,
      request: {
        dryRun: true,
        newSecretRef: "cms/wordpress/new",
        oldSecretRef: "cms/wordpress/old",
        provider: "wordpress",
      },
    });

    expect(restoreRun).toMatchObject({
      dryRun: false,
      dispatch: {
        externalRunId: "restore_drill_restore_drill_production_20260526",
        provider: "memory",
        status: "accepted",
      },
    });
    expect(rotationRun).toMatchObject({
      dryRun: true,
      dispatch: {
        externalRunId: null,
        provider: "memory",
        status: "dry_run",
      },
    });
    expect(executor.listDispatches()).toHaveLength(2);
  });

  it("dispatches restore drills to HTTP operations schedulers", async () => {
    const requests: Array<{ readonly body: unknown; readonly url: string }> = [];
    const fetchFn: typeof fetch = async (url, init) => {
      requests.push({
        body: JSON.parse(String(init?.body)),
        url: String(url),
      });
      return new Response(
        JSON.stringify({
          acceptedAt: "2026-05-26T00:02:00.000Z",
          externalRunId: "ops_run_1",
          message: "accepted",
          provider: "deployment_scheduler",
        }),
        { status: 202 },
      );
    };
    const scheduler = createHttpBackupRestoreDrillScheduler({
      endpointUrl: "https://ops.example.com/restore-drills",
      fetchFn,
      provider: "deployment_scheduler",
    });
    const run = await executeBackupRestoreDrill({
      createdAt,
      request: {
        dryRun: false,
        environment: "production",
      },
      scheduler,
    });

    expect(run.dispatch).toEqual({
      acceptedAt: "2026-05-26T00:02:00.000Z",
      externalRunId: "ops_run_1",
      message: "accepted",
      provider: "deployment_scheduler",
      status: "accepted",
    });
    expect(requests[0]).toMatchObject({
      url: "https://ops.example.com/restore-drills",
      body: {
        dryRun: false,
        kind: "backup_restore_drill",
      },
    });
  });
});
