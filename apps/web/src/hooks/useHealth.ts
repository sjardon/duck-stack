import { useQuery, UseQueryResult } from '@tanstack/react-query';
import { fetchHealth, HealthResponse } from '../api/health';
import { ApiError } from '../api/client';

export function useHealth(): UseQueryResult<HealthResponse, ApiError> {
  return useQuery<HealthResponse, ApiError>({
    queryKey: ['health'],
    queryFn: fetchHealth,
  });
}
