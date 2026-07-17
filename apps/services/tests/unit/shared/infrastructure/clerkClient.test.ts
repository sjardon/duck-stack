const mockCreateClerkClient = jest.fn();
jest.mock('@clerk/backend', () => ({
  createClerkClient: (...args: unknown[]) => mockCreateClerkClient(...args),
}));

const ORIGINAL_SECRET = process.env.CLERK_SECRET_KEY;

afterEach(() => {
  if (ORIGINAL_SECRET === undefined) {
    delete process.env.CLERK_SECRET_KEY;
  } else {
    process.env.CLERK_SECRET_KEY = ORIGINAL_SECRET;
  }
  jest.resetModules();
  jest.clearAllMocks();
});

// T005 — R008, R009: clerkClient singleton fail-fast and construction
describe('clerkClient singleton', () => {
  it('WHEN CLERK_SECRET_KEY is absent THEN the module throws synchronously at import time', async () => {
    delete process.env.CLERK_SECRET_KEY;
    jest.resetModules();

    await expect(import('../../../../src/shared/infrastructure/clerkClient.js')).rejects.toThrow(
      /CLERK_SECRET_KEY/,
    );
  });

  it('WHEN CLERK_SECRET_KEY is present THEN createClerkClient is called with the secretKey and the client is exported', async () => {
    process.env.CLERK_SECRET_KEY = 'test-secret-key';
    const fakeClient = { users: {}, organizations: {} };
    mockCreateClerkClient.mockReturnValue(fakeClient);
    jest.resetModules();

    const mod = await import('../../../../src/shared/infrastructure/clerkClient.js');

    expect(mockCreateClerkClient).toHaveBeenCalledWith({ secretKey: 'test-secret-key' });
    expect(mod.clerkClient).toBe(fakeClient);
  });
});
