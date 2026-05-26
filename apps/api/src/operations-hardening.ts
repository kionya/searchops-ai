import {
  BackupRestoreDrillPlanSchema,
  DeadLetterReplayPlanSchema,
  SecretRotationPlanSchema,
  type BackupRestoreDrillPlan,
  type DeadLetterJobRecord,
  type DeadLetterReplayPlan,
  type SecretRotationPlan,
  type SecretRotationPlanRequest,
} from "@searchops/types";

export interface CreateBackupRestoreDrillPlanInput {
  readonly createdAt: Date;
  readonly environment: string;
}

export interface CreateSecretRotationPlanInput extends SecretRotationPlanRequest {
  readonly createdAt: Date;
}

export interface CreateDeadLetterReplayPlanInput {
  readonly createdAt: Date;
  readonly job: DeadLetterJobRecord;
}

export function createBackupRestoreDrillPlan({
  createdAt,
  environment,
}: CreateBackupRestoreDrillPlanInput): BackupRestoreDrillPlan {
  const normalizedEnvironment = normalizeToken(environment);

  return BackupRestoreDrillPlanSchema.parse({
    id: `restore_drill_${normalizedEnvironment}_${formatPlanDate(createdAt)}`,
    environment,
    createdAt: createdAt.toISOString(),
    requiredInputs: ["DATABASE_URL", "RESTORE_DATABASE_URL", "private backup destination"],
    status: "ready",
    steps: [
      {
        id: "preflight_migration_status",
        title: "Check migration status",
        description: "Confirm Prisma migration status before creating or restoring a backup.",
        command: "corepack pnpm db:migrate:status",
        status: "ready",
      },
      {
        id: "create_backup",
        title: "Create PostgreSQL backup",
        description: "Create a custom-format dump without owner or ACL metadata.",
        command:
          'pg_dump --format=custom --no-owner --no-acl "$DATABASE_URL" --file searchops-YYYYMMDD-HHMM.dump',
        status: "ready",
      },
      {
        id: "restore_scratch",
        title: "Restore into scratch database",
        description: "Restore the dump into a scratch database isolated from production traffic.",
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
}

export function createSecretRotationPlan({
  createdAt,
  newSecretRef,
  oldSecretRef,
  provider,
  verificationEvent = "signed webhook or connector fixture event",
}: CreateSecretRotationPlanInput): SecretRotationPlan {
  const normalizedProvider = normalizeToken(provider);

  return SecretRotationPlanSchema.parse({
    id: `secret_rotation_${normalizedProvider}_${formatPlanDate(createdAt)}`,
    provider,
    createdAt: createdAt.toISOString(),
    oldSecretRef,
    newSecretRef,
    verificationEvent,
    status: oldSecretRef === newSecretRef ? "blocked" : "ready",
    steps: [
      {
        id: "add_new_secret",
        title: "Add new secret reference",
        description: "Add the new secret in deployment secret storage without exposing the value.",
        command: null,
        status: "ready",
      },
      {
        id: "deploy_accepting_new_secret",
        title: "Deploy configuration accepting the new secret",
        description: "Deploy a config revision that reads the new secret reference.",
        command: null,
        status: "ready",
      },
      {
        id: "verify_new_secret",
        title: "Verify new secret",
        description: `Send ${verificationEvent} signed with the new secret reference.`,
        command: null,
        status: "ready",
      },
      {
        id: "retire_old_secret",
        title: "Retire old secret",
        description: "Remove the old secret reference after the verification window.",
        command: null,
        status: oldSecretRef === newSecretRef ? "blocked" : "ready",
      },
    ],
  });
}

export function createDeadLetterReplayPlan({
  createdAt,
  job,
}: CreateDeadLetterReplayPlanInput): DeadLetterReplayPlan {
  return DeadLetterReplayPlanSchema.parse({
    id: `dead_letter_replay_${normalizeToken(job.id)}_${formatPlanDate(createdAt)}`,
    createdAt: createdAt.toISOString(),
    deadLetterJobId: job.id,
    originalQueue: job.payload.originalQueue,
    originalJobName: job.payload.originalJobName,
    originalJobId: job.payload.originalJobId,
    reason:
      "Replay requires queue-specific reconstruction because dead-letter entries intentionally omit raw customer/provider payloads.",
    status: "blocked",
    steps: [
      {
        id: "inspect_failure",
        title: "Inspect failed job metadata",
        description: "Review queue, job name, attempt count, and failure reason before replay.",
        command: null,
        status: "ready",
      },
      {
        id: "reconstruct_payload",
        title: "Reconstruct payload from source of truth",
        description: "Use DB records or deterministic fixture inputs, not dead-letter metadata alone.",
        command: null,
        status: "blocked",
      },
      {
        id: "enqueue_replay",
        title: "Enqueue queue-specific replay",
        description: "Replay only after the owning queue processor defines an idempotent retry path.",
        command: null,
        status: "blocked",
      },
    ],
  });
}

function normalizeToken(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function formatPlanDate(date: Date) {
  return date.toISOString().slice(0, 10).replaceAll("-", "");
}
