import { ListPlansUseCase } from '../../../../src/modules/subscriptions/useCases/listPlansUseCase.js';
import type { ISubscriptionPlanRepository } from '../../../../src/modules/subscriptions/repositories/interfaces/iSubscriptionPlanRepository.js';
import type { SubscriptionPlanEntity } from '../../../../src/modules/subscriptions/entities/subscriptionPlan.entity.js';

const freePlan: SubscriptionPlanEntity = {
  id: '00000000-0000-0000-0001-000000000001',
  code: 'free',
  name: 'Free',
  description: 'Get started at no cost.',
  price: 0,
  currency: 'USD',
  interval: 'month',
  features: ['Up to 3 projects', 'Community support'],
  is_active: true,
  provider_plan_id: null,
  created_at: '2026-06-23T00:00:00.000Z',
  updated_at: '2026-06-23T00:00:00.000Z',
};

const proPlan: SubscriptionPlanEntity = {
  id: '00000000-0000-0000-0001-000000000002',
  code: 'pro',
  name: 'Pro',
  description: 'For individuals and small teams.',
  price: 12,
  currency: 'USD',
  interval: 'month',
  features: ['Unlimited projects', 'Priority support', 'Advanced analytics'],
  is_active: true,
  provider_plan_id: null,
  created_at: '2026-06-23T00:00:00.000Z',
  updated_at: '2026-06-23T00:00:00.000Z',
};

function makeRepo(plans: SubscriptionPlanEntity[]): ISubscriptionPlanRepository {
  return {
    listActive: jest.fn().mockResolvedValue(plans),
  };
}

describe('ListPlansUseCase — basic execution (R002)', () => {
  it('WHEN execute is called THEN it returns all items from repo.listActive', async () => {
    const repo = makeRepo([freePlan, proPlan]);
    const useCase = new ListPlansUseCase(repo);

    const result = await useCase.execute();

    expect(repo.listActive).toHaveBeenCalledTimes(1);
    expect(result).toEqual([freePlan, proPlan]);
  });
});

describe('ListPlansUseCase — empty catalog (R002)', () => {
  it('WHEN the repository returns an empty array THEN the use case returns an empty array', async () => {
    const repo = makeRepo([]);
    const useCase = new ListPlansUseCase(repo);

    const result = await useCase.execute();

    expect(result).toEqual([]);
  });
});

describe('ListPlansUseCase — free plan inclusion (EC001)', () => {
  it('WHEN the repository returns a plan with price = 0 THEN it is included in the result', async () => {
    const repo = makeRepo([freePlan]);
    const useCase = new ListPlansUseCase(repo);

    const result = await useCase.execute();

    expect(result).toHaveLength(1);
    expect(result[0].price).toBe(0);
    expect(result[0].code).toBe('free');
  });
});

describe('ListPlansUseCase — inactive plan omission (EC002)', () => {
  it('WHEN the repository returns only active plans THEN no inactive plans appear in the result', async () => {
    const repo = makeRepo([freePlan, proPlan]);
    const useCase = new ListPlansUseCase(repo);

    const result = await useCase.execute();

    const hasInactive = result.some((p) => !p.is_active);
    expect(hasInactive).toBe(false);
  });
});
