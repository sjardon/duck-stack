import { ErrorOccurrenceSampler } from '../../../../src/shared/providers/errorOccurrenceSampler.js';

afterEach(() => {
  jest.restoreAllMocks();
});

// T004 — EC004
describe('ErrorOccurrenceSampler.shouldSend — first-occurrence guarantee (EC004)', () => {
  it('WHEN shouldSend(fingerprint) is called for a fingerprint never seen before THEN it returns true regardless of sampleRate', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.999);
    const sampler = new ErrorOccurrenceSampler(0);

    expect(sampler.shouldSend('fingerprint-a')).toBe(true);
  });
});

// T004 — EC004
describe('ErrorOccurrenceSampler.shouldSend — repeat sampling (EC004)', () => {
  it('WHEN shouldSend is called again for the same fingerprint THEN it applies the sample rate instead of always returning true', () => {
    const sampler = new ErrorOccurrenceSampler(0.5);

    // First occurrence — always sent.
    expect(sampler.shouldSend('fingerprint-b')).toBe(true);

    // Repeat occurrence — deterministically dropped (random > sampleRate).
    jest.spyOn(Math, 'random').mockReturnValue(0.9);
    expect(sampler.shouldSend('fingerprint-b')).toBe(false);

    // Repeat occurrence — deterministically sent (random < sampleRate).
    jest.spyOn(Math, 'random').mockReturnValue(0.1);
    expect(sampler.shouldSend('fingerprint-b')).toBe(true);
  });
});
