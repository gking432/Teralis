'use client';

import { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'outline' | 'ghost';
type Size = 'default' | 'sm';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variantClasses: Record<Variant, string> = {
  primary: 'bg-text text-white border-none hover:bg-[#333]',
  outline: 'bg-transparent text-text border-[1.5px] border-text hover:bg-text hover:text-white',
  ghost: 'bg-transparent text-text-muted border-none hover:text-text',
};

const sizeClasses: Record<Size, string> = {
  default: 'px-6 py-2.5 text-[13px]',
  sm: 'px-3.5 py-1.5 text-[11px]',
};

export function Button({
  variant = 'primary',
  size = 'default',
  className = '',
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`font-body font-medium tracking-[0.8px] uppercase cursor-pointer transition-all duration-200 ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
