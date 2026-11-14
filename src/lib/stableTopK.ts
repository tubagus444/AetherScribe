interface Candidate<T> { value: T; score: number; ordinal: number }

/** Exact, stable top-k. Retains at most k payloads instead of sorting all rows. */
export class StableTopK<T> {
  private heap: Candidate<T>[] = [];
  private ordinal = 0;
  private limit: number;
  constructor(limit: number) { this.limit = Math.trunc(Math.max(1, limit)) || 0; }
  get size() { return this.heap.length; }
  private compare(a: Candidate<T>, b: Candidate<T>) { return a.score - b.score || b.ordinal - a.ordinal; }
  add(value: T, score: number) {
    const candidate = { value, score, ordinal: this.ordinal++ };
    if (!this.limit) return;
    if (this.heap.length < this.limit) {
      this.heap.push(candidate);
      let index = this.heap.length - 1;
      while (index > 0) {
        const parent = (index - 1) >> 1;
        if (this.compare(this.heap[index], this.heap[parent]) >= 0) break;
        [this.heap[index], this.heap[parent]] = [this.heap[parent], this.heap[index]];
        index = parent;
      }
    } else if (this.compare(candidate, this.heap[0]) > 0) {
      this.heap[0] = candidate;
      let index = 0;
      for (;;) {
        let worst = index;
        for (const child of [index * 2 + 1, index * 2 + 2]) {
          if (child < this.heap.length && this.compare(this.heap[child], this.heap[worst]) < 0) worst = child;
        }
        if (worst === index) break;
        [this.heap[index], this.heap[worst]] = [this.heap[worst], this.heap[index]];
        index = worst;
      }
    }
  }
  results(): T[] { return [...this.heap].sort((a, b) => this.compare(b, a)).map(candidate => candidate.value); }
}
