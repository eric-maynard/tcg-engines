/**
 * A FIFO async mutex. The Riftbound engine reads card data from a
 * process-global registry, so every tool call that touches a game must run
 * exclusively (and re-`activate()` that game's registry first).
 */
export class Mutex {
  private tail: Promise<void> = Promise.resolve();

  run<T>(fn: () => Promise<T> | T): Promise<T> {
    const prev = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((r) => {
      release = r;
    });
    return prev.then(async () => {
      try {
        return await fn();
      } finally {
        release();
      }
    });
  }
}
