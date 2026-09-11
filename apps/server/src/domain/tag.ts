import { DomainError } from "./errors.js";
import {
  assertIsoDateTime,
  assertRevision,
  assertText,
  assertUuid,
  normalizeTagName,
} from "./values.js";

export const TAG_NAME_MAX = 40;
const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

export interface Tag {
  formatVersion: 1;
  revision: number;
  id: string;
  name: string;
  normalizedName: string;
  color?: string;
  createdAt: string;
  updatedAt: string;
}

export function validateTag(tag: Tag): void {
  if (!tag || typeof tag !== "object") {
    throw new DomainError("invalid-value", "tag must be an object");
  }
  if (tag.formatVersion !== 1) {
    throw new DomainError("invalid-value", "tag formatVersion must be 1", {
      formatVersion: tag.formatVersion,
    });
  }
  assertRevision(tag.revision, "tag.revision");
  assertUuid(tag.id, "tag.id");
  assertText(tag.name, "tag.name", { max: TAG_NAME_MAX });
  assertText(tag.normalizedName, "tag.normalizedName", { max: TAG_NAME_MAX });
  if (tag.normalizedName !== normalizeTagName(tag.name)) {
    throw new DomainError("invalid-value", "tag.normalizedName must be the normalized name", {
      name: tag.name,
      normalizedName: tag.normalizedName,
    });
  }
  if (tag.color !== undefined && !COLOR_PATTERN.test(tag.color)) {
    throw new DomainError("invalid-value", "tag.color must be a #rrggbb value", {
      color: tag.color,
    });
  }
  assertIsoDateTime(tag.createdAt, "tag.createdAt");
  assertIsoDateTime(tag.updatedAt, "tag.updatedAt");
}

export interface NewTag {
  name: string;
  color?: string;
}

export function createTag(input: NewTag, deps: { id: string; now: string }): Tag {
  const tag: Tag = {
    formatVersion: 1,
    revision: 1,
    id: deps.id,
    name: input.name.trim(),
    normalizedName: normalizeTagName(input.name),
    ...(input.color ? { color: input.color } : {}),
    createdAt: deps.now,
    updatedAt: deps.now,
  };
  validateTag(tag);
  return tag;
}

/** Tag identity is Unicode-normalized and case-insensitive. */
export function isSameTagName(a: string, b: string): boolean {
  return normalizeTagName(a) === normalizeTagName(b);
}
