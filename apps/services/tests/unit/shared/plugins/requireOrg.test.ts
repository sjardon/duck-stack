jest.mock('../../../../src/shared/infrastructure/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import type { FastifyReply, FastifyRequest } from 'fastify';
import { requireOrg } from '../../../../src/shared/plugins/requireOrg.js';
import { UnauthorizedError, ForbiddenError } from '../../../../src/shared/errors.js';

function buildRequest(userId: string | undefined, orgId: string | null | undefined): FastifyRequest {
  return { userId, orgId } as unknown as FastifyRequest;
}

const reply = {} as FastifyReply;

// T001/T003 — R001, R002, R003, R004, EC001, EC002

describe('requireOrg — three-way guard behavior (R001, R002, R003, R004, EC001, EC002)', () => {
  it('WHEN request.userId is undefined THEN it throws UnauthorizedError and done is never called (R002, EC002)', () => {
    const done = jest.fn();
    const request = buildRequest(undefined, undefined);

    expect(() => requireOrg(request, reply, done)).toThrow(UnauthorizedError);
    expect(done).not.toHaveBeenCalled();
  });

  it('WHEN request.userId is set and request.orgId is null THEN it throws ForbiddenError and done is never called (R003, EC001)', () => {
    const done = jest.fn();
    const request = buildRequest('user-1', null);

    expect(() => requireOrg(request, reply, done)).toThrow(ForbiddenError);
    expect(done).not.toHaveBeenCalled();
  });

  it('WHEN request.userId is set and request.orgId is present THEN done is called exactly once and no error is thrown (R004)', () => {
    const done = jest.fn();
    const request = buildRequest('user-1', 'org-1');

    expect(() => requireOrg(request, reply, done)).not.toThrow();
    expect(done).toHaveBeenCalledTimes(1);
  });
});
