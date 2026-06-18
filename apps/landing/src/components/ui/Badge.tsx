import React from 'react';

interface BadgeProps {
  label: string;
  variant?: 'default' | 'highlight';
}

export default function Badge({
  label,
  variant = 'default',
}: BadgeProps): JSX.Element {
  return (
    <span data-variant={variant}>
      {label}
    </span>
  );
}
