import React from 'react';

interface ButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary';
  type?: 'button' | 'submit' | 'reset';
}

export default function Button({
  children,
  onClick,
  variant = 'primary',
  type = 'button',
}: ButtonProps): JSX.Element {
  return (
    <button
      type={type}
      onClick={onClick}
      data-variant={variant}
    >
      {children}
    </button>
  );
}
