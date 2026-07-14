import { createHash } from "node:crypto";
import {
  chmodSync,
  cpSync,
  lstatSync,
  lutimesSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmSync,
  rmdirSync,
  utimesSync,
} from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

export const connectorLiveArtifactPaths = [
  "packages/types/dist",
  "packages/db/dist",
  "packages/connectors/dist",
  "packages/db/src/generated",
] as const;

export type ConnectorLiveArtifactPath = (typeof connectorLiveArtifactPaths)[number];

export type ArtifactTransactionFaultPoint =
  | "before-backup-copy"
  | "before-original-remove"
  | "before-restore-copy"
  | "before-restore-install"
  | "before-backup-cleanup";

export interface ArtifactTransactionFaultEvent {
  readonly artifactIndex: number;
  readonly artifactPath: ConnectorLiveArtifactPath;
  readonly backupPath: string;
  readonly point: ArtifactTransactionFaultPoint;
  readonly targetPath: string;
}

interface ArtifactTransactionInput<T> {
  readonly injectFault?: (event: ArtifactTransactionFaultEvent) => void;
  readonly repositoryRoot: string;
  readonly runOperation: (input: {
    readonly artifactTargets: readonly ArtifactTarget[];
    readonly repositoryRoot: string;
  }) => T;
}

export interface ArtifactTarget {
  readonly absolutePath: string;
  readonly relativePath: ConnectorLiveArtifactPath;
}

interface ArtifactSnapshot {
  readonly contentHash: string;
  readonly metadataHash: string;
}

interface TreeMetadata {
  readonly kind: "directory" | "file" | "symlink";
  readonly mode: number;
  readonly mtimeNs: bigint;
  readonly relativePath: string;
}

interface ArtifactState extends ArtifactTarget {
  readonly artifactIndex: number;
  readonly backupPath: string;
  readonly existed: boolean;
  readonly metadata: readonly TreeMetadata[];
  readonly originalSnapshot?: ArtifactSnapshot;
  readonly quarantinePath: string;
  readonly restoreStagePath: string;
  backupComplete: boolean;
  backupVerified: boolean;
  originalRemoved: boolean;
  restoreComplete: boolean;
  restoreVerified: boolean;
}

const backupBaseRelativePath = ".searchops-smoke-backups";

export function runConnectorLiveArtifactTransaction<T>({
  injectFault = () => undefined,
  repositoryRoot,
  runOperation,
}: ArtifactTransactionInput<T>): T {
  const validatedRoot = validateRepositoryRoot(repositoryRoot);
  const artifactTargets = connectorLiveArtifactPaths.map((relativePath) => ({
    absolutePath: resolveFixedArtifactTarget(validatedRoot, relativePath),
    relativePath,
  }));

  for (const target of artifactTargets) {
    assertSafePath(validatedRoot, target.absolutePath);
  }

  const backupBase = resolveContainedPath(validatedRoot, backupBaseRelativePath);
  assertSafePath(validatedRoot, backupBase);
  mkdirSync(backupBase, { recursive: true });
  assertSafePath(validatedRoot, backupBase);
  const backupRoot = mkdtempSync(join(backupBase, "run-"));
  assertSafePath(validatedRoot, backupRoot);

  const states: ArtifactState[] = artifactTargets.map((target, artifactIndex) => {
    const existed = pathExists(target.absolutePath);
    return {
      ...target,
      artifactIndex,
      backupComplete: false,
      backupPath: join(backupRoot, `backup-${artifactIndex}`),
      backupVerified: false,
      existed,
      metadata: existed ? captureTreeMetadata(target.absolutePath) : [],
      ...(existed ? { originalSnapshot: snapshotTree(target.absolutePath) } : {}),
      originalRemoved: false,
      quarantinePath: join(backupRoot, `quarantine-${artifactIndex}`),
      restoreComplete: false,
      restoreStagePath: join(backupRoot, `restore-${artifactIndex}`),
      restoreVerified: false,
    };
  });

  let operationError: unknown;
  let operationResult: T | undefined;
  const recoveryErrors: Error[] = [];

  try {
    prepareArtifacts(validatedRoot, states, injectFault);
    operationResult = runOperation({ artifactTargets, repositoryRoot: validatedRoot });
  } catch (error) {
    operationError = error;
  } finally {
    for (const state of states) {
      recoverArtifact(validatedRoot, state, injectFault, recoveryErrors);
    }
    cleanupEmptyTransactionDirectories(validatedRoot, backupRoot, backupBase, recoveryErrors);
  }

  const retainedBackups = states
    .filter(
      (state) =>
        state.backupComplete &&
        state.backupVerified &&
        pathExists(state.backupPath) &&
        state.originalSnapshot !== undefined &&
        snapshotsEqual(snapshotTree(state.backupPath), state.originalSnapshot),
    )
    .map((state) => relative(validatedRoot, state.backupPath));
  const retainedPartialBackups = states
    .filter(
      (state) =>
        pathExists(state.backupPath) &&
        !retainedBackups.includes(relative(validatedRoot, state.backupPath)),
    )
    .map((state) => relative(validatedRoot, state.backupPath));
  const retainedQuarantines = states
    .filter((state) => pathExists(state.quarantinePath))
    .map((state) => relative(validatedRoot, state.quarantinePath));
  const retainedStages = states
    .filter((state) => pathExists(state.restoreStagePath))
    .map((state) => relative(validatedRoot, state.restoreStagePath));

  if (
    recoveryErrors.length > 0 ||
    retainedBackups.length > 0 ||
    retainedPartialBackups.length > 0 ||
    retainedQuarantines.length > 0 ||
    retainedStages.length > 0
  ) {
    const diagnostic = [
      "connector_live_clean_artifact_transaction_failed",
      operationError === undefined ? "" : `operationError=${formatUnknownError(operationError)}`,
      ...recoveryErrors.map((error) => error.message),
      ...retainedBackups.map((path) => `manualRecoveryPath=${path}`),
      ...retainedPartialBackups.map((path) => `retainedPartialBackupPath=${path}`),
      ...retainedQuarantines.map((path) => `retainedQuarantinePath=${path}`),
      ...retainedStages.map((path) => `retainedRestoreStagePath=${path}`),
    ]
      .filter(Boolean)
      .join("\n");
    throw new Error(diagnostic, {
      cause: recoveryErrors[0] ?? operationError,
    });
  }

  if (operationError !== undefined) {
    throw operationError;
  }
  return operationResult as T;
}

function prepareArtifacts(
  repositoryRoot: string,
  states: readonly ArtifactState[],
  injectFault: (event: ArtifactTransactionFaultEvent) => void,
) {
  for (const state of states) {
    if (!state.existed) {
      state.originalRemoved = true;
      continue;
    }

    try {
      assertSafePath(repositoryRoot, state.absolutePath);
      assertSafePath(repositoryRoot, state.backupPath);
      injectFault(toFaultEvent(state, "before-backup-copy"));
      cpSync(state.absolutePath, state.backupPath, copyOptions);
      state.backupComplete = true;
      restoreTreeMetadata(repositoryRoot, state.backupPath, state.metadata);
      state.backupVerified = snapshotsEqual(
        snapshotTree(state.backupPath),
        requireOriginalSnapshot(state),
      );
      if (!state.backupVerified) {
        throw new Error("backup_verification_failed");
      }
    } catch (error) {
      throw new Error(
        `connector_live_clean_artifact_backup_failed:${state.relativePath}: ${formatUnknownError(error)}`,
        { cause: error },
      );
    }

    try {
      assertSafePath(repositoryRoot, state.absolutePath);
      injectFault(toFaultEvent(state, "before-original-remove"));
      assertSafePath(repositoryRoot, state.absolutePath);
      safeRemove(repositoryRoot, state.absolutePath);
      state.originalRemoved = true;
    } catch (error) {
      throw new Error(
        `connector_live_clean_artifact_original_remove_failed:${state.relativePath}: ${formatUnknownError(error)}`,
        { cause: error },
      );
    }
  }
}

function recoverArtifact(
  repositoryRoot: string,
  state: ArtifactState,
  injectFault: (event: ArtifactTransactionFaultEvent) => void,
  recoveryErrors: Error[],
) {
  if (state.existed && !state.backupComplete) {
    if (targetMatchesOriginal(state)) {
      state.restoreComplete = true;
      state.restoreVerified = true;
    } else {
      recoveryErrors.push(
        new Error(
          `connector_live_clean_artifact_unrecoverable_without_backup:${state.relativePath}`,
        ),
      );
    }
    return;
  }

  if (state.existed && state.backupComplete) {
    if (!state.backupVerified) {
      if (targetMatchesOriginal(state)) {
        state.restoreComplete = true;
        state.restoreVerified = true;
      }
      recoveryErrors.push(
        new Error(`connector_live_clean_artifact_backup_unverified:${state.relativePath}`),
      );
      return;
    }

    if (targetMatchesOriginal(state)) {
      state.restoreComplete = true;
      state.restoreVerified = true;
    } else {
      try {
        restoreFromBackup(repositoryRoot, state, injectFault);
      } catch (error) {
        recoveryErrors.push(
          new Error(
            `connector_live_clean_artifact_restore_failed:${state.relativePath}: ${formatUnknownError(error)}`,
            { cause: error },
          ),
        );
      }
    }
  } else if (!state.existed) {
    try {
      restoreAbsentTarget(repositoryRoot, state);
    } catch (error) {
      recoveryErrors.push(
        new Error(
          `connector_live_clean_artifact_restore_absent_failed:${state.relativePath}: ${formatUnknownError(error)}`,
          { cause: error },
        ),
      );
    }
  }

  if (state.restoreVerified && pathExists(state.quarantinePath)) {
    try {
      safeRemove(repositoryRoot, state.quarantinePath);
    } catch (error) {
      recoveryErrors.push(
        new Error(
          `connector_live_clean_artifact_quarantine_cleanup_failed:${state.relativePath}: ${formatUnknownError(error)}`,
          { cause: error },
        ),
      );
    }
  }

  if (
    state.backupComplete &&
    state.backupVerified &&
    state.restoreComplete &&
    state.restoreVerified &&
    !pathExists(state.quarantinePath)
  ) {
    try {
      injectFault(toFaultEvent(state, "before-backup-cleanup"));
      safeRemove(repositoryRoot, state.backupPath);
    } catch (error) {
      recoveryErrors.push(
        new Error(
          `connector_live_clean_artifact_backup_cleanup_failed:${state.relativePath}: ${formatUnknownError(error)}`,
          { cause: error },
        ),
      );
    }
  }
}

function restoreFromBackup(
  repositoryRoot: string,
  state: ArtifactState,
  injectFault: (event: ArtifactTransactionFaultEvent) => void,
) {
  if (pathExists(state.restoreStagePath) || pathExists(state.quarantinePath)) {
    throw new Error("transaction_restore_paths_not_empty");
  }

  assertSafePath(repositoryRoot, state.backupPath);
  assertSafePath(repositoryRoot, state.restoreStagePath);
  injectFault(toFaultEvent(state, "before-restore-copy"));
  cpSync(state.backupPath, state.restoreStagePath, copyOptions);
  restoreTreeMetadata(repositoryRoot, state.restoreStagePath, state.metadata);
  if (!snapshotsEqual(snapshotTree(state.restoreStagePath), requireOriginalSnapshot(state))) {
    throw new Error("restore_stage_verification_failed");
  }

  let quarantined = false;
  if (pathExists(state.absolutePath)) {
    safeRename(repositoryRoot, state.absolutePath, state.quarantinePath);
    quarantined = true;
  }

  try {
    injectFault(toFaultEvent(state, "before-restore-install"));
    safeRename(repositoryRoot, state.restoreStagePath, state.absolutePath);
  } catch (error) {
    if (quarantined && !pathExists(state.absolutePath) && pathExists(state.quarantinePath)) {
      safeRename(repositoryRoot, state.quarantinePath, state.absolutePath);
    }
    throw error;
  }

  state.restoreComplete = true;
  state.restoreVerified = targetMatchesOriginal(state);
  if (!state.restoreVerified) {
    throw new Error("restored_target_verification_failed");
  }
}

function restoreAbsentTarget(repositoryRoot: string, state: ArtifactState) {
  if (pathExists(state.absolutePath)) {
    if (pathExists(state.quarantinePath)) {
      throw new Error("absent_restore_quarantine_not_empty");
    }
    safeRename(repositoryRoot, state.absolutePath, state.quarantinePath);
  }
  state.restoreComplete = true;
  state.restoreVerified = !pathExists(state.absolutePath);
  if (!state.restoreVerified) {
    throw new Error("absent_target_verification_failed");
  }
}

function cleanupEmptyTransactionDirectories(
  repositoryRoot: string,
  backupRoot: string,
  backupBase: string,
  recoveryErrors: Error[],
) {
  tryRemoveEmptyDirectory(repositoryRoot, backupRoot, recoveryErrors);
  tryRemoveEmptyDirectory(repositoryRoot, backupBase, recoveryErrors);
}

function tryRemoveEmptyDirectory(repositoryRoot: string, path: string, recoveryErrors: Error[]) {
  if (!pathExists(path) || readdirSync(path).length > 0) {
    return;
  }
  try {
    assertSafePath(repositoryRoot, path);
    rmdirSync(path);
  } catch (error) {
    recoveryErrors.push(
      new Error(
        `connector_live_clean_artifact_backup_root_cleanup_failed:${relative(repositoryRoot, path)}: ${formatUnknownError(error)}`,
        { cause: error },
      ),
    );
  }
}

const copyOptions = {
  preserveTimestamps: true,
  recursive: true,
  verbatimSymlinks: true,
} as const;

function safeRemove(repositoryRoot: string, path: string) {
  assertSafePath(repositoryRoot, path);
  rmSync(path, { force: true, recursive: true });
}

function safeRename(repositoryRoot: string, source: string, destination: string) {
  assertSafePath(repositoryRoot, source);
  assertSafePath(repositoryRoot, destination);
  renameSync(source, destination);
}

function validateRepositoryRoot(repositoryRoot: string) {
  const lexicalRoot = resolve(repositoryRoot);
  const resolvedRoot = realpathSync(lexicalRoot);
  const stat = lstatSync(resolvedRoot);
  if (!stat.isDirectory()) {
    throw new Error(`connector_live_clean_artifact_repo_root_invalid:${repositoryRoot}`);
  }
  return resolvedRoot;
}

function resolveFixedArtifactTarget(
  repositoryRoot: string,
  relativePath: ConnectorLiveArtifactPath,
) {
  if (!connectorLiveArtifactPaths.includes(relativePath)) {
    throw new Error(`connector_live_clean_artifact_target_not_fixed:${relativePath}`);
  }
  return resolveContainedPath(repositoryRoot, relativePath);
}

function resolveContainedPath(repositoryRoot: string, relativePath: string) {
  if (isAbsolute(relativePath)) {
    throw new Error(`connector_live_clean_artifact_path_outside_repo:${relativePath}`);
  }
  const absolutePath = resolve(repositoryRoot, relativePath);
  assertLexicallyContained(repositoryRoot, absolutePath);
  return absolutePath;
}

function assertSafePath(repositoryRoot: string, path: string) {
  const absolutePath = resolve(path);
  assertLexicallyContained(repositoryRoot, absolutePath);
  const pathRelativeToRoot = relative(repositoryRoot, absolutePath);
  let currentPath = repositoryRoot;

  for (const segment of pathRelativeToRoot.split(sep).filter(Boolean)) {
    currentPath = join(currentPath, segment);
    let stat;
    try {
      stat = lstatSync(currentPath);
    } catch (error) {
      if (getErrorCode(error) === "ENOENT") {
        break;
      }
      throw error;
    }
    if (stat.isSymbolicLink()) {
      throw new Error(
        `connector_live_clean_artifact_symlink_component:${relative(repositoryRoot, currentPath)}`,
      );
    }
    const resolvedPath = realpathSync(currentPath);
    assertLexicallyContained(repositoryRoot, resolvedPath);
  }
}

function assertLexicallyContained(repositoryRoot: string, path: string) {
  const pathRelativeToRoot = relative(repositoryRoot, path);
  if (
    pathRelativeToRoot === ".." ||
    pathRelativeToRoot.startsWith(`..${sep}`) ||
    isAbsolute(pathRelativeToRoot)
  ) {
    throw new Error(`connector_live_clean_artifact_path_outside_repo:${path}`);
  }
}

function snapshotTree(path: string): ArtifactSnapshot {
  const contentHash = createHash("sha256");
  const metadataHash = createHash("sha256");
  hashPath(path, contentHash, metadataHash);
  return {
    contentHash: contentHash.digest("hex"),
    metadataHash: metadataHash.digest("hex"),
  };
}

function hashPath(
  path: string,
  contentHash: ReturnType<typeof createHash>,
  metadataHash: ReturnType<typeof createHash>,
) {
  let stat;
  try {
    stat = lstatSync(path, { bigint: true });
  } catch (error) {
    if (getErrorCode(error) !== "ENOENT") {
      throw error;
    }
    contentHash.update("missing");
    metadataHash.update("missing");
    return;
  }

  if (stat.isSymbolicLink()) {
    contentHash.update(`link:${readlinkSync(path)}`);
    metadataHash.update(`link:${stat.mode}:${stat.mtimeNs / 1_000n}`);
    return;
  }
  if (stat.isDirectory()) {
    contentHash.update("directory");
    metadataHash.update(`directory:${stat.mode}:${stat.mtimeNs / 1_000n}`);
    for (const entry of readdirSync(path).sort()) {
      contentHash.update(entry);
      metadataHash.update(entry);
      hashPath(join(path, entry), contentHash, metadataHash);
    }
    return;
  }

  contentHash.update("file");
  contentHash.update(readFileSync(path));
  metadataHash.update(`file:${stat.mode}:${stat.mtimeNs / 1_000n}:${stat.size}`);
}

function captureTreeMetadata(rootPath: string) {
  const entries: TreeMetadata[] = [];
  visit(rootPath, "");
  return entries;

  function visit(path: string, relativePath: string) {
    const stat = lstatSync(path, { bigint: true });
    const kind = stat.isSymbolicLink() ? "symlink" : stat.isDirectory() ? "directory" : "file";
    entries.push({ kind, mode: Number(stat.mode), mtimeNs: stat.mtimeNs, relativePath });
    if (kind === "directory") {
      for (const entry of readdirSync(path).sort()) {
        visit(join(path, entry), join(relativePath, entry));
      }
    }
  }
}

function restoreTreeMetadata(
  repositoryRoot: string,
  rootPath: string,
  metadata: readonly TreeMetadata[],
) {
  const entries = [...metadata].sort((left, right) => {
    if (left.kind === "directory" && right.kind !== "directory") {
      return 1;
    }
    if (left.kind !== "directory" && right.kind === "directory") {
      return -1;
    }
    return right.relativePath.length - left.relativePath.length;
  });

  for (const entry of entries) {
    const path = resolve(rootPath, entry.relativePath);
    const timestamp = nanosecondsToSeconds(entry.mtimeNs);
    assertSafePath(repositoryRoot, path);
    if (entry.kind === "symlink") {
      lutimesSync(path, timestamp, timestamp);
      continue;
    }
    chmodSync(path, entry.mode);
    utimesSync(path, timestamp, timestamp);
  }
}

function nanosecondsToSeconds(value: bigint) {
  const nanosecondsPerSecond = 1_000_000_000n;
  const nanosecondsPerMicrosecond = 1_000n;
  const microsecondMidpoint = 500n;
  const portableValue =
    (value / nanosecondsPerMicrosecond) * nanosecondsPerMicrosecond + microsecondMidpoint;
  return (
    Number(portableValue / nanosecondsPerSecond) +
    Number(portableValue % nanosecondsPerSecond) / Number(nanosecondsPerSecond)
  );
}

function targetMatchesOriginal(state: ArtifactState) {
  return (
    state.originalSnapshot !== undefined &&
    pathExists(state.absolutePath) &&
    snapshotsEqual(snapshotTree(state.absolutePath), state.originalSnapshot)
  );
}

function snapshotsEqual(left: ArtifactSnapshot, right: ArtifactSnapshot) {
  return left.contentHash === right.contentHash && left.metadataHash === right.metadataHash;
}

function requireOriginalSnapshot(state: ArtifactState) {
  if (state.originalSnapshot === undefined) {
    throw new Error(
      `connector_live_clean_artifact_original_snapshot_missing:${state.relativePath}`,
    );
  }
  return state.originalSnapshot;
}

function pathExists(path: string) {
  try {
    lstatSync(path);
    return true;
  } catch (error) {
    if (getErrorCode(error) === "ENOENT") {
      return false;
    }
    throw error;
  }
}

function toFaultEvent(
  state: ArtifactState,
  point: ArtifactTransactionFaultPoint,
): ArtifactTransactionFaultEvent {
  return {
    artifactIndex: state.artifactIndex,
    artifactPath: state.relativePath,
    backupPath: state.backupPath,
    point,
    targetPath: state.absolutePath,
  };
}

function getErrorCode(error: unknown) {
  return error instanceof Error && "code" in error
    ? String((error as Error & { readonly code?: unknown }).code)
    : undefined;
}

export function formatUnknownError(error: unknown) {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  if (typeof error === "string") {
    return error;
  }
  try {
    return JSON.stringify(error) ?? String(error);
  } catch {
    return String(error);
  }
}
