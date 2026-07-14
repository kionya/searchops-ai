import { createHash } from "node:crypto";
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmSync,
  rmdirSync,
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
  | "before-original-move"
  | "before-quarantine-move"
  | "before-original-restore"
  | "before-quarantine-cleanup";

export interface ArtifactTransactionFaultEvent {
  readonly artifactIndex: number;
  readonly artifactPath: ConnectorLiveArtifactPath;
  readonly backupPath: string;
  readonly point: ArtifactTransactionFaultPoint;
  readonly quarantinePath: string;
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

interface ArtifactState extends ArtifactTarget {
  readonly artifactIndex: number;
  readonly backupPath: string;
  readonly existed: boolean;
  readonly originalSnapshot?: ArtifactSnapshot;
  readonly quarantinePath: string;
  originalMoved: boolean;
  restoreComplete: boolean;
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
  const originalsRoot = join(backupRoot, "originals");
  const quarantineRoot = join(backupRoot, "quarantine");
  mkdirSync(originalsRoot);
  mkdirSync(quarantineRoot);
  assertSafePath(validatedRoot, originalsRoot);
  assertSafePath(validatedRoot, quarantineRoot);

  const states: ArtifactState[] = artifactTargets.map((target, artifactIndex) => {
    const existed = pathExists(target.absolutePath);
    return {
      ...target,
      artifactIndex,
      backupPath: join(originalsRoot, String(artifactIndex)),
      existed,
      ...(existed ? { originalSnapshot: snapshotTree(target.absolutePath) } : {}),
      originalMoved: false,
      quarantinePath: join(quarantineRoot, String(artifactIndex)),
      restoreComplete: false,
    };
  });

  let operationError: unknown;
  let operationResult: T | undefined;
  const recoveryErrors: Error[] = [];

  try {
    moveOriginalsToBackup(validatedRoot, states, injectFault);
    operationResult = runOperation({ artifactTargets, repositoryRoot: validatedRoot });
  } catch (error) {
    operationError = error;
  } finally {
    for (const state of states) {
      restoreArtifact(validatedRoot, state, injectFault, recoveryErrors);
    }

    if (states.every((state) => artifactRestored(state))) {
      cleanupQuarantines(validatedRoot, states, injectFault, recoveryErrors);
    }
    cleanupEmptyTransactionDirectories(
      validatedRoot,
      [originalsRoot, quarantineRoot, backupRoot, backupBase],
      recoveryErrors,
    );
  }

  const retainedBackups = states
    .filter(
      (state) =>
        state.originalSnapshot !== undefined &&
        pathExists(state.backupPath) &&
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

  if (
    recoveryErrors.length > 0 ||
    retainedBackups.length > 0 ||
    retainedPartialBackups.length > 0 ||
    retainedQuarantines.length > 0
  ) {
    const diagnostic = [
      "connector_live_clean_artifact_transaction_failed",
      operationError === undefined ? "" : `operationError=${formatUnknownError(operationError)}`,
      ...recoveryErrors.map((error) => error.message),
      ...retainedBackups.map((path) => `manualRecoveryPath=${path}`),
      ...retainedPartialBackups.map((path) => `retainedPartialBackupPath=${path}`),
      ...retainedQuarantines.map((path) => `retainedQuarantinePath=${path}`),
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

function moveOriginalsToBackup(
  repositoryRoot: string,
  states: readonly ArtifactState[],
  injectFault: (event: ArtifactTransactionFaultEvent) => void,
) {
  for (const state of states) {
    if (!state.existed) {
      continue;
    }

    try {
      injectFault(toFaultEvent(state, "before-original-move"));
      safeRename(repositoryRoot, state.absolutePath, state.backupPath);
      state.originalMoved = true;
      if (!backupMatchesOriginal(state)) {
        throw new Error("moved_original_verification_failed");
      }
    } catch (error) {
      throw new Error(
        `connector_live_clean_artifact_original_move_failed:${state.relativePath}: ${formatUnknownError(error)}`,
        { cause: error },
      );
    }
  }
}

function restoreArtifact(
  repositoryRoot: string,
  state: ArtifactState,
  injectFault: (event: ArtifactTransactionFaultEvent) => void,
  recoveryErrors: Error[],
) {
  if (!state.existed) {
    quarantineGeneratedTarget(repositoryRoot, state, injectFault, recoveryErrors);
    return;
  }

  if (!state.originalMoved) {
    state.restoreComplete = targetMatchesOriginal(state);
    if (!state.restoreComplete) {
      recoveryErrors.push(
        new Error(`connector_live_clean_artifact_original_not_preserved:${state.relativePath}`),
      );
    }
    return;
  }

  if (!backupMatchesOriginal(state)) {
    recoveryErrors.push(
      new Error(`connector_live_clean_artifact_backup_unverified:${state.relativePath}`),
    );
    return;
  }

  if (pathExists(state.absolutePath)) {
    try {
      injectFault(toFaultEvent(state, "before-quarantine-move"));
      safeRename(repositoryRoot, state.absolutePath, state.quarantinePath);
    } catch (error) {
      recoveryErrors.push(
        new Error(
          `connector_live_clean_artifact_quarantine_move_failed:${state.relativePath}: ${formatUnknownError(error)}`,
          { cause: error },
        ),
      );
      return;
    }
  }

  try {
    injectFault(toFaultEvent(state, "before-original-restore"));
    safeRename(repositoryRoot, state.backupPath, state.absolutePath);
    state.originalMoved = false;
    state.restoreComplete = true;
  } catch (error) {
    recoveryErrors.push(
      new Error(
        `connector_live_clean_artifact_original_restore_failed:${state.relativePath}: ${formatUnknownError(error)}`,
        { cause: error },
      ),
    );
    rollbackQuarantine(repositoryRoot, state, recoveryErrors);
  }
}

function quarantineGeneratedTarget(
  repositoryRoot: string,
  state: ArtifactState,
  injectFault: (event: ArtifactTransactionFaultEvent) => void,
  recoveryErrors: Error[],
) {
  if (!pathExists(state.absolutePath)) {
    state.restoreComplete = true;
    return;
  }

  try {
    injectFault(toFaultEvent(state, "before-quarantine-move"));
    safeRename(repositoryRoot, state.absolutePath, state.quarantinePath);
    state.restoreComplete = true;
  } catch (error) {
    recoveryErrors.push(
      new Error(
        `connector_live_clean_artifact_quarantine_move_failed:${state.relativePath}: ${formatUnknownError(error)}`,
        { cause: error },
      ),
    );
  }
}

function rollbackQuarantine(repositoryRoot: string, state: ArtifactState, recoveryErrors: Error[]) {
  if (pathExists(state.absolutePath) || !pathExists(state.quarantinePath)) {
    return;
  }

  try {
    safeRename(repositoryRoot, state.quarantinePath, state.absolutePath);
  } catch (error) {
    recoveryErrors.push(
      new Error(
        `connector_live_clean_artifact_quarantine_rollback_failed:${state.relativePath}: ${formatUnknownError(error)}`,
        { cause: error },
      ),
    );
  }
}

function cleanupQuarantines(
  repositoryRoot: string,
  states: readonly ArtifactState[],
  injectFault: (event: ArtifactTransactionFaultEvent) => void,
  recoveryErrors: Error[],
) {
  for (const state of states) {
    if (!pathExists(state.quarantinePath)) {
      continue;
    }
    try {
      injectFault(toFaultEvent(state, "before-quarantine-cleanup"));
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
}

function cleanupEmptyTransactionDirectories(
  repositoryRoot: string,
  paths: readonly string[],
  recoveryErrors: Error[],
) {
  for (const path of paths) {
    if (!pathExists(path) || readdirSync(path).length > 0) {
      continue;
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
}

function artifactRestored(state: ArtifactState) {
  if (!state.restoreComplete) {
    return false;
  }
  if (state.existed) {
    return !state.originalMoved && !pathExists(state.backupPath) && pathExists(state.absolutePath);
  }
  return !pathExists(state.absolutePath);
}

function backupMatchesOriginal(state: ArtifactState) {
  return (
    state.originalSnapshot !== undefined &&
    pathExists(state.backupPath) &&
    snapshotsEqual(snapshotTree(state.backupPath), state.originalSnapshot)
  );
}

function targetMatchesOriginal(state: ArtifactState) {
  return (
    state.originalSnapshot !== undefined &&
    pathExists(state.absolutePath) &&
    snapshotsEqual(snapshotTree(state.absolutePath), state.originalSnapshot)
  );
}

function safeRename(repositoryRoot: string, source: string, destination: string) {
  assertSafePath(repositoryRoot, source);
  assertSafePath(repositoryRoot, destination);
  renameSync(source, destination);
}

function safeRemove(repositoryRoot: string, path: string) {
  assertSafePath(repositoryRoot, path);
  rmSync(path, { force: true, recursive: true });
}

function validateRepositoryRoot(repositoryRoot: string) {
  const lexicalRoot = resolve(repositoryRoot);
  const resolvedRoot = realpathSync(lexicalRoot);
  if (!lstatSync(resolvedRoot).isDirectory()) {
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
    assertLexicallyContained(repositoryRoot, realpathSync(currentPath));
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

function snapshotsEqual(left: ArtifactSnapshot, right: ArtifactSnapshot) {
  return left.contentHash === right.contentHash && left.metadataHash === right.metadataHash;
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
    quarantinePath: state.quarantinePath,
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
