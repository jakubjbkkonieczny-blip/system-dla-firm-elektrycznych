/**
 * Central job priority configuration.
 * Add new entries to JOB_PRIORITY_DEFINITIONS to extend (e.g. critical).
 */

export const JOB_PRIORITY_VALUES = ["normal", "important"] as const;

export type JobPriority = (typeof JOB_PRIORITY_VALUES)[number];

export type JobPriorityBadgeStyles = {
  container: string;
  dot: string;
};

export type JobPriorityDefinition = {
  value: JobPriority;
  /** Polish UI label */
  label: string;
  /** Lowercase legacy DB/API/input aliases mapped to this value */
  legacyAliases: readonly string[];
  badge: JobPriorityBadgeStyles;
  sortOrder: number;
};

export const JOB_PRIORITY_DEFINITIONS: readonly JobPriorityDefinition[] = [
  {
    value: "normal",
    label: "Normalny",
    legacyAliases: ["standard", "standardowy", "normalny"],
    badge: {
      container: "bg-bg-secondary text-text-muted border-border",
      dot: "bg-text-muted",
    },
    sortOrder: 0,
  },
  {
    value: "important",
    label: "Ważny",
    legacyAliases: [
      "urgent",
      "high",
      "wysoki",
      "wazny",
      "ważny",
    ],
    badge: {
      container: "bg-warning-bg text-warning border-warning-border",
      dot: "bg-warning",
    },
    sortOrder: 1,
  },
] as const;

const DEFINITION_BY_VALUE = new Map(
  JOB_PRIORITY_DEFINITIONS.map((d) => [d.value, d])
);

const ALIAS_TO_PRIORITY = new Map<string, JobPriority>();

for (const def of JOB_PRIORITY_DEFINITIONS) {
  ALIAS_TO_PRIORITY.set(def.value, def.value);
  for (const alias of def.legacyAliases) {
    ALIAS_TO_PRIORITY.set(alias.toLowerCase(), def.value);
  }
}

/** Canonical values in display order (extensible). */
export const JOB_PRIORITIES_ORDERED: JobPriority[] = [...JOB_PRIORITY_DEFINITIONS]
  .sort((a, b) => a.sortOrder - b.sortOrder)
  .map((d) => d.value);

function resolveAlias(raw: string): JobPriority | null {
  const key = raw.trim().toLowerCase();
  if (!key) return null;
  return ALIAS_TO_PRIORITY.get(key) ?? null;
}

/**
 * Normalizes any stored or incoming priority to a canonical value.
 * Unknown values default to `normal` (read-safe).
 */
export function normalizeJobPriority(value: unknown): JobPriority {
  if (typeof value !== "string") return "normal";
  return resolveAlias(value) ?? "normal";
}

/**
 * Parses priority for writes. Returns null when the value is present but invalid.
 * Undefined / empty defaults to `normal`.
 */
export function parseJobPriorityForWrite(value: unknown): JobPriority | null {
  if (value === undefined || value === null) return "normal";
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return "normal";
  return resolveAlias(trimmed);
}

export function isCanonicalJobPriority(value: string): value is JobPriority {
  return (JOB_PRIORITY_VALUES as readonly string[]).includes(value);
}

export function getJobPriorityDefinition(priority: JobPriority): JobPriorityDefinition {
  const def = DEFINITION_BY_VALUE.get(priority);
  if (!def) return JOB_PRIORITY_DEFINITIONS[0];
  return def;
}

export function getJobPriorityLabel(priority: unknown): string {
  return getJobPriorityDefinition(normalizeJobPriority(priority)).label;
}

export function getJobPriorityBadgeStyles(priority: unknown): JobPriorityBadgeStyles {
  return getJobPriorityDefinition(normalizeJobPriority(priority)).badge;
}
