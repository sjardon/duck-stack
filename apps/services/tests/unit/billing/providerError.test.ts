import { ProviderError } from '../../../src/shared/errors.js';

describe('ProviderError', () => {
  it('(NF002) defaults statusCode to 502 when none provided', () => {
    const error = new ProviderError('upstream failure');

    expect(error.statusCode).toBe(502);
    expect(error.code).toBe('PROVIDER_ERROR');
    expect(error.message).toBe('upstream failure');
  });

  it('(NF002) uses statusCode 400 when explicitly set', () => {
    const error = new ProviderError('validation error from provider', 400);

    expect(error.statusCode).toBe(400);
    expect(error.code).toBe('PROVIDER_ERROR');
    expect(error.message).toBe('validation error from provider');
  });

  it('(NF002) uses statusCode 502 when explicitly set', () => {
    const error = new ProviderError('gateway error', 502);

    expect(error.statusCode).toBe(502);
  });

  it('(NF002) is an instance of Error', () => {
    const error = new ProviderError('msg');

    expect(error).toBeInstanceOf(Error);
  });
});
