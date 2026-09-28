/**
 * Global queue for Termux RUN_COMMAND operations.
 *
 * Two lanes:
 *  - high  → interactive console input (user typed in the Termux panel)
 *  - normal → agent / packages / script runner / everything else
 *
 * High-priority jobs always run before pending normal jobs once the
 * currently executing command finishes. A running command is never
 * pre-empted (Android RUN_COMMAND is one-at-a-time); priority only
 * reorders the wait list.
 */

export type TermuxQueuePriority = "high" | "normal";

type Job = {
  priority: TermuxQueuePriority;
  run: () => Promise<void>;
};

let highQueue: Job[] = [];
let normalQueue: Job[] = [];
let processing = false;
let pendingCount = 0;
let runningPriority: TermuxQueuePriority | null = null;

function recomputePending() {
  pendingCount = highQueue.length + normalQueue.length + (processing ? 1 : 0);
}

async function pump() {
  if (processing) return;
  processing = true;
  try {
    while (highQueue.length > 0 || normalQueue.length > 0) {
      const job = highQueue.shift() || normalQueue.shift();
      if (!job) break;
      runningPriority = job.priority;
      recomputePending();
      try {
        await job.run();
      } catch {
        /* errors are handled by the job's own promise reject */
      }
    }
  } finally {
    runningPriority = null;
    processing = false;
    recomputePending();
  }
}

/**
 * Enqueue a Termux job. Returns a Promise that resolves/rejects with the job result.
 */
export function enqueueTermuxCommand<T>(
  job: () => Promise<T>,
  opts?: { priority?: TermuxQueuePriority }
): Promise<T> {
  const priority: TermuxQueuePriority = opts?.priority === "high" ? "high" : "normal";
  return new Promise<T>((resolve, reject) => {
    const wrapped: Job = {
      priority,
      run: async () => {
        try {
          resolve(await job());
        } catch (e) {
          reject(e);
        }
      },
    };
    if (priority === "high") highQueue.push(wrapped);
    else normalQueue.push(wrapped);
    recomputePending();
    void pump();
  });
}

export function getTermuxCommandQueueDepth(): number {
  return pendingCount;
}

export function getTermuxQueueSnapshot(): {
  pending: number;
  high: number;
  normal: number;
  running: TermuxQueuePriority | null;
} {
  return {
    pending: pendingCount,
    high: highQueue.length,
    normal: normalQueue.length,
    running: runningPriority,
  };
}

export function isTermuxCommandQueueIdle(): boolean {
  return pendingCount === 0 && !processing;
}
