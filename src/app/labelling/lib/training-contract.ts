export type ShotFootwork =
  | "front_foot"
  | "back_foot"
  | "both"
  | "unclear";

export const SUBJECT_FOCUS_ROLE_VALUES = [
  "batter",
  "bowler",
  "non_striker",
  "wicketkeeper",
  "fielder",
  "umpire",
  "other",
  "unclear",
] as const;
export type SubjectFocusRole = (typeof SUBJECT_FOCUS_ROLE_VALUES)[number];

export const SHOT_TYPE_VALUES = [
  "defensive",
  "straight_drive",
  "cover_drive",
  "on_drive",
  "square_drive",
  "cut",
  "pull",
  "hook",
  "flick",
  "leg_glance",
  "sweep",
  "reverse_sweep",
  "paddle_scoop",
  "lofted_shot",
  "leave",
  "other",
  "unclear",
] as const;
export type ShotType = (typeof SHOT_TYPE_VALUES)[number];

export interface SubjectFocusMetadata {
  multiplePeopleVisible?: boolean;
  subjectFocusRole?: SubjectFocusRole | null;
  subjectFocusDescription?: string;
}

export interface DeliveryShotMetadata {
  shotType?: ShotType | null;
  shotTypeOther?: string;
}

export type FootworkApplicabilityState =
  | "not_restricted"
  | "applicable"
  | "excluded_mismatch"
  | "excluded_unclear"
  | "unresolved_missing";

interface FootworkApplicableKpi {
  scope: string;
  appliesTo?: string;
}

interface EvidenceLabel {
  evidenceMs: number | null;
  evidenceFramesMs?: number[];
}

const FRONT_FOOT_ONLY = "Front-Foot Only";
const BACK_FOOT_ONLY = "Back-Foot Only";

export function normalizeSubjectFocusRole(
  value: unknown,
): SubjectFocusRole | null {
  return SUBJECT_FOCUS_ROLE_VALUES.includes(value as SubjectFocusRole)
    ? (value as SubjectFocusRole)
    : null;
}

export function normalizeShotType(value: unknown): ShotType | null {
  return SHOT_TYPE_VALUES.includes(value as ShotType)
    ? (value as ShotType)
    : null;
}

export function normalizeSubjectFocusMetadata(
  value: SubjectFocusMetadata | null | undefined,
) {
  const multiplePeopleVisible = value?.multiplePeopleVisible === true;
  return {
    multiplePeopleVisible,
    subjectFocusRole: multiplePeopleVisible
      ? normalizeSubjectFocusRole(value?.subjectFocusRole)
      : null,
    subjectFocusDescription:
      multiplePeopleVisible && typeof value?.subjectFocusDescription === "string"
        ? value.subjectFocusDescription.trim()
        : "",
  };
}

export function normalizeDeliveryShotMetadata(
  value: DeliveryShotMetadata | null | undefined,
) {
  const shotType = normalizeShotType(value?.shotType);
  return {
    shotType,
    shotTypeOther:
      shotType === "other" && typeof value?.shotTypeOther === "string"
        ? value.shotTypeOther.trim()
        : "",
  };
}

export function isSubjectFocusComplete(
  value: SubjectFocusMetadata | null | undefined,
) {
  const normalized = normalizeSubjectFocusMetadata(value);
  return (
    !normalized.multiplePeopleVisible ||
    (normalized.subjectFocusRole !== null &&
      normalized.subjectFocusDescription.trim().length > 0)
  );
}

export function isDeliveryShotComplete(
  value: DeliveryShotMetadata | null | undefined,
  discipline?: string,
) {
  if (discipline !== "batting") return true;
  const normalized = normalizeDeliveryShotMetadata(value);
  return (
    normalized.shotType !== null &&
    (normalized.shotType !== "other" ||
      normalized.shotTypeOther.trim().length > 0)
  );
}

export function footworkRequirementFor(
  kpi: FootworkApplicableKpi,
): "front_foot" | "back_foot" | null {
  if (kpi.scope !== "delivery") return null;
  if (kpi.appliesTo === FRONT_FOOT_ONLY) return "front_foot";
  if (kpi.appliesTo === BACK_FOOT_ONLY) return "back_foot";
  return null;
}

export function isFootworkRestrictedKpi(kpi: FootworkApplicableKpi): boolean {
  return footworkRequirementFor(kpi) !== null;
}

export function footworkApplicability(
  kpi: FootworkApplicableKpi,
  shotFootwork: ShotFootwork | null | undefined,
): FootworkApplicabilityState {
  if (!isFootworkRestrictedKpi(kpi)) return "not_restricted";
  if (!shotFootwork) return "unresolved_missing";
  if (shotFootwork === "unclear") return "excluded_unclear";
  if (shotFootwork === "both") return "applicable";

  const matches = footworkRequirementFor(kpi) === shotFootwork;
  return matches ? "applicable" : "excluded_mismatch";
}

export function isFootworkApplicableForScoring(
  state: FootworkApplicabilityState,
): boolean {
  return state === "not_restricted" || state === "applicable";
}

/**
 * Returns stable evidence points. With a valid FPS they are snapped to the
 * nearest frame and de-duplicated by frame index; otherwise integer
 * milliseconds are used. The legacy singular timestamp participates in the
 * same sorted set, so index zero is the deterministic primary value exported
 * to older CSV columns.
 */
export function canonicalEvidenceTimestamps(
  label: EvidenceLabel,
  fps?: number,
): number[] {
  const candidates = [
    label.evidenceMs,
    ...(Array.isArray(label.evidenceFramesMs) ? label.evidenceFramesMs : []),
  ].filter(
    (value): value is number =>
      typeof value === "number" && Number.isFinite(value) && value >= 0,
  );

  if (typeof fps === "number" && Number.isFinite(fps) && fps > 0) {
    const frameIndices = candidates.map((timestampMs) =>
      Math.round((timestampMs / 1000) * fps),
    );
    return [...new Set(frameIndices)]
      .sort((left, right) => left - right)
      .map((frameIndex) => Math.round((frameIndex / fps) * 1000));
  }

  const timestamps = candidates.map((value) => Math.round(value));
  return [...new Set(timestamps)].sort((left, right) => left - right);
}

export function evidenceFrameIndices(
  timestampsMs: number[],
  fps: number,
): number[] {
  if (!Number.isFinite(fps) || fps <= 0) return [];
  return timestampsMs.map((timestampMs) =>
    Math.round((timestampMs / 1000) * fps),
  );
}

/**
 * A project is labelled for exactly one purpose, chosen at upload.
 *
 * `biomechanics` is the original workflow: mark deliveries, then score the
 * rubric KPIs against them. `auto_clip` trains a model to find deliveries in
 * an unsegmented video, so it collects boundaries instead of KPI judgements
 * and never touches a rubric.
 */
export const LABELLING_MODES = ["biomechanics", "auto_clip"] as const;
export type LabellingMode = (typeof LABELLING_MODES)[number];

export function normalizeLabellingMode(value: unknown): LabellingMode {
  return LABELLING_MODES.includes(value as LabellingMode)
    ? (value as LabellingMode)
    : "biomechanics";
}

/**
 * Stretches of video that are neither a delivery nor usable background. A
 * clipping model trained on broadcast footage has to be told about replays and
 * slow motion explicitly: they look exactly like deliveries, so leaving them in
 * the background would teach the model that real deliveries are negatives.
 */
export const EXCLUSION_REASONS = [
  "replay",
  "slow_motion",
  "warm_up",
  "non_match_footage",
  "crowd_or_cutaway",
  "other",
] as const;
export type ExclusionReason = (typeof EXCLUSION_REASONS)[number];

export function normalizeExclusionReason(value: unknown): ExclusionReason | null {
  return EXCLUSION_REASONS.includes(value as ExclusionReason)
    ? (value as ExclusionReason)
    : null;
}

export interface ExcludedRegion {
  id: string;
  startMs: number;
  endMs: number;
  reason: ExclusionReason | null;
  note: string;
}

export function normalizeExcludedRegion(value: unknown): ExcludedRegion | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<ExcludedRegion>;
  if (typeof candidate.id !== "string" || !candidate.id) return null;
  const startMs = Number(candidate.startMs);
  const endMs = Number(candidate.endMs);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;
  return {
    id: candidate.id,
    startMs: Math.round(startMs),
    endMs: Math.round(endMs),
    reason: normalizeExclusionReason(candidate.reason),
    note: typeof candidate.note === "string" ? candidate.note : "",
  };
}

export function normalizeExcludedRegions(value: unknown): ExcludedRegion[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(normalizeExcludedRegion)
    .filter((region): region is ExcludedRegion => region !== null)
    .sort((left, right) => left.startMs - right.startMs || left.id.localeCompare(right.id));
}

/** Inclusive-start, exclusive-end overlap between two half-open ranges. */
export function rangesOverlap(
  leftStartMs: number,
  leftEndMs: number,
  rightStartMs: number,
  rightEndMs: number,
) {
  return leftStartMs < rightEndMs && rightStartMs < leftEndMs;
}

/**
 * The stretches of a video that carry no delivery and no exclusion. These are
 * the confirmed negatives a detection model trains on, so they are only ever
 * derived when the annotator has asserted that every delivery is marked --
 * otherwise an unmarked delivery would be handed to the model as background.
 */
export function backgroundRegions(
  durationMs: number,
  deliveries: { startMs: number; endMs: number }[],
  excluded: { startMs: number; endMs: number }[],
) {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return [];
  const blocked = [...deliveries, ...excluded]
    .map((region) => ({
      startMs: Math.max(0, Math.min(region.startMs, durationMs)),
      endMs: Math.max(0, Math.min(region.endMs, durationMs)),
    }))
    .filter((region) => region.endMs > region.startMs)
    .sort((left, right) => left.startMs - right.startMs);

  const gaps: { startMs: number; endMs: number }[] = [];
  let cursor = 0;
  for (const region of blocked) {
    if (region.startMs > cursor) {
      gaps.push({ startMs: cursor, endMs: region.startMs });
    }
    cursor = Math.max(cursor, region.endMs);
  }
  if (cursor < durationMs) gaps.push({ startMs: cursor, endMs: durationMs });
  return gaps;
}
