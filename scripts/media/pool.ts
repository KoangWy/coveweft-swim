/** Run a worker over items with at most `concurrency` promises in flight. */
export async function runPool<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let next = 0;
  const workers = Array.from(
    { length: Math.max(1, Math.min(concurrency, items.length)) },
    async () => {
      while (true) {
        const index = next;
        next += 1;
        if (index >= items.length) {
          return;
        }
        await worker(items[index], index);
      }
    },
  );
  await Promise.all(workers);
}
