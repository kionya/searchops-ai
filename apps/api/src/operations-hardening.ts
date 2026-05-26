import {
  BackupRestoreDrillPlanSchema,
  BackupRestoreDrillExecutionResponseSchema,
  DeadLetterReplayPlanSchema,
  OperationalDispatchResultSchema,
  SecretRotationExecutionResponseSchema,
  SecretRotationPlanSchema,
  type BackupRestoreDrillPlan,
  type BackupRestoreDrillExecutionResponse,
  type DeadLetterJobRecord,
  type DeadLetterReplayPlan,
  type OperationalDispatchResult,
  type SecretRotationExecutionResponse,
  type SecretRotationPlan,
  type SecretRotationPlanRequest,
  type ExecuteBackupRestoreDrillRequest,
  type ExecuteSecretRotationRequest,
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

export interface BackupRestoreDrillScheduler {
  scheduleRestoreDrill(
    plan: BackupRestoreDrillPlan,
    options: { readonly dryRun: boolean },
  ): Promise<OperationalDispatchResult>;
}

export interface SecretRotationExecutor {
  executeSecretRotation(
    plan: SecretRotationPlan,
    options: { readonly dryRun: boolean },
  ): Promise<OperationalDispatchResult>;
}

export interface CreateHttpOperationsExecutorOptions {
  readonly endpointUrl: string;
  readonly bearerToken?: string | undefined;
  readonly fetchFn?: typeof fetch;
  readonly provider?: string;
}

export interface MemoryOperationsExecutor
  extends BackupRestoreDrillScheduler,
    SecretRotationExecutor {
  listDispatches(): readonly OperationalDispatchResult[];
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

export async function executeBackupRestoreDrill({
  createdAt,
  request,
  scheduler,
}: {
  readonly createdAt: Date;
  readonly request: ExecuteBackupRestoreDrillRequest;
  readonly scheduler: BackupRestoreDrillScheduler;
}): Promise<BackupRestoreDrillExecutionResponse> {
  const plan = createBackupRestoreDrillPlan({
    createdAt,
    environment: request.environment,
  });
  const dispatch = await scheduler.scheduleRestoreDrill(plan, { dryRun: request.dryRun });

  return BackupRestoreDrillExecutionResponseSchema.parse({
    dryRun: request.dryRun,
    plan,
    dispatch,
  });
}

export async function executeSecretRotation({
  createdAt,
  executor,
  request,
}: {
  readonly createdAt: Date;
  readonly executor: SecretRotationExecutor;
  readonly request: ExecuteSecretRotationRequest;
}): Promise<SecretRotationExecutionResponse> {
  const plan = createSecretRotationPlan({
    ...request,
    createdAt,
  });
  const dispatch =
    plan.status === "blocked"
      ? createBlockedDispatchResult({
          acceptedAt: createdAt,
          message: "Secret rotation is blocked because the old and new references are identical.",
          provider: "blocked",
        })
      : await executor.executeSecretRotation(plan, { dryRun: request.dryRun });

  return SecretRotationExecutionResponseSchema.parse({
    dryRun: request.dryRun,
    plan,
    dispatch,
  });
}

export function createNoopBackupRestoreDrillScheduler(): BackupRestoreDrillScheduler {
  return {
    async scheduleRestoreDrill(plan) {
      return createBlockedDispatchResult({
        acceptedAt: new Date(plan.createdAt),
        message: "No restore drill scheduler is configured for this runtime.",
        provider: "not_configured",
      });
    },
  };
}

export function createNoopSecretRotationExecutor(): SecretRotationExecutor {
  return {
    async executeSecretRotation(plan) {
      return createBlockedDispatchResult({
        acceptedAt: new Date(plan.createdAt),
        message: "No secret rotation executor is configured for this runtime.",
        provider: "not_configured",
      });
    },
  };
}

export function createMemoryOperationsExecutor(
  currentTime: () => Date = () => new Date(),
): MemoryOperationsExecutor {
  const dispatches: OperationalDispatchResult[] = [];

  async function dispatch({
    dryRun,
    id,
    kind,
  }: {
    readonly dryRun: boolean;
    readonly id: string;
    readonly kind: string;
  }) {
    const dispatchResult = OperationalDispatchResultSchema.parse({
      acceptedAt: currentTime().toISOString(),
      externalRunId: dryRun ? null : `${kind}_${id}`,
      message: dryRun
        ? `Dry-run accepted for ${kind}.`
        : `Dispatched ${kind} to the configured operations executor.`,
      provider: "memory",
      status: dryRun ? "dry_run" : "accepted",
    });
    dispatches.push(dispatchResult);
    return dispatchResult;
  }

  return {
    async scheduleRestoreDrill(plan, options) {
      return dispatch({
        dryRun: options.dryRun,
        id: plan.id,
        kind: "restore_drill",
      });
    },
    async executeSecretRotation(plan, options) {
      return dispatch({
        dryRun: options.dryRun,
        id: plan.id,
        kind: "secret_rotation",
      });
    },
    listDispatches() {
      return [...dispatches];
    },
  };
}

export function createHttpBackupRestoreDrillScheduler(
  options: CreateHttpOperationsExecutorOptions,
): BackupRestoreDrillScheduler {
  return {
    async scheduleRestoreDrill(plan, { dryRun }) {
      return postOperationsDispatch({
        body: {
          dryRun,
          kind: "backup_restore_drill",
          plan,
        },
        options,
      });
    },
  };
}

export function createHttpSecretRotationExecutor(
  options: CreateHttpOperationsExecutorOptions,
): SecretRotationExecutor {
  return {
    async executeSecretRotation(plan, { dryRun }) {
      return postOperationsDispatch({
        body: {
          dryRun,
          kind: "secret_rotation",
          plan,
        },
        options,
      });
    },
  };
}

function createBlockedDispatchResult({
  acceptedAt,
  message,
  provider,
}: {
  readonly acceptedAt: Date;
  readonly message: string;
  readonly provider: string;
}) {
  return OperationalDispatchResultSchema.parse({
    acceptedAt: acceptedAt.toISOString(),
    externalRunId: null,
    message,
    provider,
    status: "blocked",
  });
}

async function postOperationsDispatch({
  body,
  options,
}: {
  readonly body: Record<string, unknown>;
  readonly options: CreateHttpOperationsExecutorOptions;
}) {
  const fetchFn = options.fetchFn ?? fetch;
  const response = await fetchFn(options.endpointUrl, {
    body: JSON.stringify(body),
    headers: createJsonHeaders(options.bearerToken),
    method: "POST",
  });

  if (!response.ok) {
    return OperationalDispatchResultSchema.parse({
      acceptedAt: new Date().toISOString(),
      externalRunId: null,
      message: `Operations executor returned HTTP ${response.status}.`,
      provider: options.provider ?? "http",
      status: "failed",
    });
  }

  const responseBody = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return OperationalDispatchResultSchema.parse({
    acceptedAt:
      typeof responseBody.acceptedAt === "string" ? responseBody.acceptedAt : new Date().toISOString(),
    externalRunId:
      typeof responseBody.externalRunId === "string" && responseBody.externalRunId.length > 0
        ? responseBody.externalRunId
        : null,
    message:
      typeof responseBody.message === "string" && responseBody.message.length > 0
        ? responseBody.message
        : "Operations executor accepted the dispatch.",
    provider:
      typeof responseBody.provider === "string" && responseBody.provider.length > 0
        ? responseBody.provider
        : (options.provider ?? "http"),
    status: "accepted",
  });
}

function createJsonHeaders(bearerToken: string | undefined) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (bearerToken !== undefined) {
    headers.authorization = `Bearer ${bearerToken}`;
  }
  return headers;
}

function normalizeToken(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function formatPlanDate(date: Date) {
  return date.toISOString().slice(0, 10).replaceAll("-", "");
}
