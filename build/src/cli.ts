// Copyright 2026 Stefan Prodan.
// SPDX-License-Identifier: AGPL-3.0

export function parsePositiveIntegerFlag(flag: string, value: string | undefined, defaultValue: number): number {
  const raw = value ?? String(defaultValue);
  if (!/^[1-9]\d*$/.test(raw)) {
    throw new Error(`${flag} must be a positive integer, got '${raw}'`);
  }
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`${flag} must be a safe positive integer, got '${raw}'`);
  }
  return parsed;
}
