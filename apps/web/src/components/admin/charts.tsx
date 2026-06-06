"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/**
 * Themed Recharts wrappers for the admin panel. Colors come from CSS variables
 * so charts track light/dark automatically. Each card renders a title + a
 * fixed-height responsive chart over the app's surface tokens.
 */

const ACCENT = "var(--color-accent)";
const LINE = "var(--color-line-2)";
const INK3 = "var(--color-ink-3)";

const axis = {
  stroke: INK3,
  fontSize: 11,
  tickLine: false,
  axisLine: false,
} as const;

function ChartCard({
  title,
  right,
  height = 220,
  children,
}: {
  title: string;
  right?: React.ReactNode;
  height?: number;
  children: React.ReactElement;
}) {
  return (
    <div className="card p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <p className="tag">{title}</p>
        {right}
      </div>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

const tooltipStyle = {
  contentStyle: {
    background: "var(--color-surface)",
    border: "1px solid var(--color-line)",
    borderRadius: 8,
    fontSize: 12,
  },
  labelStyle: { color: "var(--color-ink-2)" },
} as const;

export type Series = { key: string; label?: string; color?: string };

/** Bar chart over a list of {[xKey], ...series}. Good for counts/day. */
export function BarChartCard({
  title,
  right,
  data,
  xKey,
  series,
  height,
  stacked,
}: {
  title: string;
  right?: React.ReactNode;
  data: Record<string, unknown>[];
  xKey: string;
  series: Series[];
  height?: number;
  stacked?: boolean;
}) {
  return (
    <ChartCard title={title} right={right} height={height}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={LINE} vertical={false} />
        <XAxis dataKey={xKey} {...axis} minTickGap={24} />
        <YAxis {...axis} allowDecimals={false} width={36} />
        <Tooltip {...tooltipStyle} cursor={{ fill: "var(--color-fill)" }} />
        {series.map((s) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.label ?? s.key}
            stackId={stacked ? "a" : undefined}
            fill={s.color ?? ACCENT}
            radius={stacked ? 0 : [3, 3, 0, 0]}
          />
        ))}
      </BarChart>
    </ChartCard>
  );
}

/** Line chart — e.g. rating over time. Supports an optional shaded band. */
export function LineChartCard({
  title,
  right,
  data,
  xKey,
  series,
  height,
}: {
  title: string;
  right?: React.ReactNode;
  data: Record<string, unknown>[];
  xKey: string;
  series: Series[];
  height?: number;
}) {
  return (
    <ChartCard title={title} right={right} height={height}>
      <LineChart
        data={data}
        margin={{ top: 4, right: 8, left: -18, bottom: 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke={LINE} vertical={false} />
        <XAxis dataKey={xKey} {...axis} minTickGap={24} />
        <YAxis {...axis} width={42} domain={["auto", "auto"]} />
        <Tooltip {...tooltipStyle} />
        {series.map((s) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label ?? s.key}
            stroke={s.color ?? ACCENT}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ChartCard>
  );
}

/** Area chart — softer trend (e.g. activity over time). */
export function AreaChartCard({
  title,
  right,
  data,
  xKey,
  series,
  height,
}: {
  title: string;
  right?: React.ReactNode;
  data: Record<string, unknown>[];
  xKey: string;
  series: Series[];
  height?: number;
}) {
  return (
    <ChartCard title={title} right={right} height={height}>
      <AreaChart
        data={data}
        margin={{ top: 4, right: 8, left: -18, bottom: 0 }}
      >
        <defs>
          {series.map((s) => (
            <linearGradient
              key={s.key}
              id={`grad-${s.key}`}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop
                offset="0%"
                stopColor={s.color ?? ACCENT}
                stopOpacity={0.35}
              />
              <stop
                offset="100%"
                stopColor={s.color ?? ACCENT}
                stopOpacity={0}
              />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={LINE} vertical={false} />
        <XAxis dataKey={xKey} {...axis} minTickGap={24} />
        <YAxis {...axis} allowDecimals={false} width={36} />
        <Tooltip {...tooltipStyle} />
        {series.map((s) => (
          <Area
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label ?? s.key}
            stroke={s.color ?? ACCENT}
            strokeWidth={2}
            fill={`url(#grad-${s.key})`}
            isAnimationActive={false}
          />
        ))}
      </AreaChart>
    </ChartCard>
  );
}

/** Horizontal bar list — e.g. win-rate by opponent / choice distribution. */
export function HBarChartCard({
  title,
  data,
  labelKey,
  valueKey,
  height,
  color,
}: {
  title: string;
  data: Record<string, unknown>[];
  labelKey: string;
  valueKey: string;
  height?: number;
  color?: string;
}) {
  return (
    <ChartCard title={title} height={height ?? Math.max(140, data.length * 30)}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 0, right: 12, left: 8, bottom: 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke={LINE} horizontal={false} />
        <XAxis type="number" {...axis} allowDecimals={false} />
        <YAxis
          type="category"
          dataKey={labelKey}
          {...axis}
          width={120}
          tick={{ fontSize: 11, fill: INK3 }}
        />
        <Tooltip {...tooltipStyle} cursor={{ fill: "var(--color-fill)" }} />
        <Bar dataKey={valueKey} fill={color ?? ACCENT} radius={[0, 3, 3, 0]} />
      </BarChart>
    </ChartCard>
  );
}
