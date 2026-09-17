import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";

type Props = {
  title: string;
  subtitle?: string;
  value: ReactNode;
  icon?: ReactNode;
  footer?: ReactNode;
};

export function MetricCard({ title, subtitle, value, icon, footer }: Props) {
  return (
    <Card padding="md" className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">{title}</p>
        {icon ? (
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            {icon}
          </div>
        ) : null}
      </div>
      <div className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">{value}</div>
      {subtitle ? <p className="mt-1 text-xs text-muted">{subtitle}</p> : null}
      {footer ? <div className="mt-auto pt-3">{footer}</div> : null}
    </Card>
  );
}
