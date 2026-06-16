export function formatDate(date: Date | string): string {
  return new Date(date).toISOString();
}

export function formatCurrency(amount: number, currency?: string): string {
  return amount.toLocaleString('en-US', {
    style: 'currency',
    currency: currency ?? 'USD',
  });
}
