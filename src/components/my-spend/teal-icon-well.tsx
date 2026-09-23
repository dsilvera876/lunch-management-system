import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  size?: "sm" | "md" | "section" | "lg";
  className?: string;
};

const sizeClasses = {
  sm: "size-8 rounded-md [&_svg]:size-[15px]",
  md: "size-10 rounded-lg [&_svg]:size-[18px]",
  section: "size-10 rounded-lg [&_svg]:size-[19px]",
  lg: "size-12 rounded-xl [&_svg]:size-[22px]",
};

export function TealIconWell({ children, size = "md", className = "" }: Props) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center bg-primary/10 text-primary ${sizeClasses[size]} ${className}`}
    >
      {children}
    </span>
  );
}
