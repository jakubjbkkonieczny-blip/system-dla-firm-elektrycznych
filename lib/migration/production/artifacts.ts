/**
 * Protected artifact paths for production migration outputs.
 * Default location is OUTSIDE the git repository.
 */

import fs from "node:fs";
import path from "node:path";

import { resolveRepoRoot } from "@/lib/migration/production/env";

export type ArtifactKind =
  | "business-export"
  | "auth-migration"
  | "auth-rollback"
  | "validation"
  | "freeze"
  | "preflight"
  | "backup";

export function defaultArtifactRoot(repoRoot: string = resolveRepoRoot()): string {
  const fromEnv = process.env.VECTORWORK_MIGRATION_ARTIFACT_DIR?.trim();
  if (fromEnv) return path.resolve(fromEnv);
  // Sibling directory outside the repo by default.
  return path.resolve(repoRoot, "..", "vectorwork-migration-artifacts");
}

export function assertArtifactPathSafe(
  artifactRoot: string,
  repoRoot: string = resolveRepoRoot()
): {
  ok: boolean;
  outsideGit: boolean;
  resolved: string;
  warnings: string[];
} {
  const resolved = path.resolve(artifactRoot);
  const repo = path.resolve(repoRoot);
  const outsideGit =
    resolved !== repo && !resolved.startsWith(repo + path.sep);
  const warnings: string[] = [];
  if (!outsideGit) {
    warnings.push(
      "Artifact path is inside the git repository; production manifests with user/Auth identifiers must not be committed"
    );
  }
  return {
    ok: true,
    outsideGit,
    resolved,
    warnings,
  };
}

export function ensureArtifactDir(
  kind: ArtifactKind,
  opts?: { root?: string; batchId?: string; repoRoot?: string }
): {
  root: string;
  dir: string;
  outsideGit: boolean;
  warnings: string[];
} {
  const repoRoot = opts?.repoRoot ?? resolveRepoRoot();
  const root = opts?.root ?? defaultArtifactRoot(repoRoot);
  const safety = assertArtifactPathSafe(root, repoRoot);
  const stamp = opts?.batchId ?? new Date().toISOString().replace(/[:.]/g, "-");
  const dir = path.join(root, kind, stamp);
  fs.mkdirSync(dir, { recursive: true });
  return {
    root: safety.resolved,
    dir,
    outsideGit: safety.outsideGit,
    warnings: safety.warnings,
  };
}

export function writeJsonArtifact(
  filePath: string,
  payload: unknown
): string {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2) + "\n", "utf8");
  return filePath;
}
