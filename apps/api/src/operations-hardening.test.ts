import { describe, expect, it } from "vitest";

import type { DeadLetterJobRecord } from "@searchops/types";

import {
  createBackupRestoreDrillPlan,
  createDeadLetterReplayPlan,
  createSecretRotationPlan,
} from "./operations-hardening.js";

const createdAt = new Date("2026-05-26T00:00:00.000Z");

const deadLetterJob: DeadLetterJobRecord = {
  id: "searchops-crawl:dead-letter|42",
  queueName: "searchops-crawl:dead-letter",
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
});
