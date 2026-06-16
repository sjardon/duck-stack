import { useHealth } from '../../hooks/useHealth';
import { formatDate } from '../../lib/formatters';

export default function HealthPage(): JSX.Element {
  const { data, isLoading, isError, error } = useHealth();

  if (isLoading) {
    return <p>Loading...</p>;
  }

  if (isError) {
    return <p>Error: {error?.message}</p>;
  }

  return (
    <div>
      <p>Status: {data?.status}</p>
      <p>Timestamp: {data?.timestamp ? formatDate(data.timestamp) : ''}</p>
    </div>
  );
}
