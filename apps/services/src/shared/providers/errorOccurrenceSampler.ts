const MAX_TRACKED_FINGERPRINTS = 500;

// Sentry's own sampleRate init option applies a fixed probability to every
// event uniformly, which can drop an issue's first occurrence. This sampler
// tracks fingerprints it has already seen and only samples repeats, so the
// first occurrence of any condition is never dropped.
export class ErrorOccurrenceSampler {
  private readonly seen = new Map<string, true>();

  constructor(private readonly sampleRate: number) {}

  shouldSend(fingerprint: string): boolean {
    if (!this.seen.has(fingerprint)) {
      if (this.seen.size >= MAX_TRACKED_FINGERPRINTS) {
        const oldest = this.seen.keys().next().value;
        if (oldest !== undefined) this.seen.delete(oldest);
      }
      this.seen.set(fingerprint, true);
      return true;
    }
    return Math.random() < this.sampleRate;
  }
}
