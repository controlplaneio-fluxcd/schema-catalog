// Copyright 2026 Stefan Prodan.
// SPDX-License-Identifier: AGPL-3.0

export type PoolResult<T, R> =
  | { index: number; item: T; value: R }
  | { index: number; item: T; error: unknown };

/**
 * Runs `task` over `items` with at most `concurrency` tasks in flight.
 * Failures never stop the pool: every item is processed and reported, matching
 * the sequential loop this replaces. Results keep the input order.
 */
export async function runBoundedPool<T, R>(
  items: T[],
  concurrency: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<PoolResult<T, R>[]> {
  if (!Number.isSafeInteger(concurrency) || concurrency < 1) {
    throw new Error(`concurrency must be a positive integer, got ${concurrency}`);
  }

  const results: PoolResult<T, R>[] = new Array(items.length);
  let next = 0;

  async function worker(): Promise<void> {
    while (next < items.length) {
      const index = next++;
      const item = items[index]!;
      try {
        results[index] = { index, item, value: await task(item, index) };
      } catch (error) {
        results[index] = { index, item, error };
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}
