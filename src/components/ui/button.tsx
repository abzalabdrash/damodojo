"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonStyles = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium tracking-tight transition-[background-color,color,border-color,transform] duration-150 ease-[var(--ease-premium,cubic-bezier(0.16,1,0.3,1))] disabled:pointer-events-none disabled:opacity-50 active:translate-y-px focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent)]",
  {
    variants: {
      variant: {
        primary:
          "bg-[color:var(--accent)] text-[#1A1308] hover:bg-[color:var(--accent)]/90",
        secondary:
          "bg-[color:var(--bg-elevated)] text-[color:var(--text-primary)] border border-[color:var(--border-base)] hover:bg-[color:var(--bg-surface)] hover:border-[color:var(--border-strong)]",
        ghost:
          "bg-transparent text-[color:var(--text-secondary)] hover:bg-[color:var(--bg-surface)] hover:text-[color:var(--text-primary)]",
        outline:
          "bg-transparent text-[color:var(--text-primary)] border border-[color:var(--border-strong)] hover:bg-[color:var(--bg-surface)]",
        danger:
          "bg-[color:var(--danger)] text-white hover:bg-[color:var(--danger)]/90",
      },
      size: {
        sm: "h-9 px-3 text-[13px]",
        md: "h-11 px-5",
        lg: "h-12 px-7 text-base",
        icon: "h-10 w-10 p-0",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonStyles> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  function Button({ className, variant, size, ...props }, ref) {
    return (
      <button
        ref={ref}
        className={cn(buttonStyles({ variant, size }), className)}
        {...props}
      />
    );
  }
);
