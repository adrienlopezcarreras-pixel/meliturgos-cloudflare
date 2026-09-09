export class ParallelScheduler {
  constructor({ globalConcurrency = 8 } = {}) {
    this.globalConcurrency = Math.max(1, globalConcurrency);
  }

  async run(tasks = [], worker) {
    const results = new Array(tasks.length);
    let nextIndex = 0;
    const runners = Array.from({ length: Math.min(this.globalConcurrency, tasks.length) }, async () => {
      while (true) {
        const index = nextIndex++;
        if (index >= tasks.length) return;
        try {
          results[index] = { status: 'fulfilled', value: await worker(tasks[index], index) };
        } catch (reason) {
          results[index] = { status: 'rejected', reason };
        }
      }
    });
    await Promise.all(runners);
    return results;
  }
}
