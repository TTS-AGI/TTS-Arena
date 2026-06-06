"use client";

import { useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type {
  AdminGenerationOverview,
  AdminGenerationRow,
  AdminGenerationsResponse,
  AdminGenModelStat,
} from "@ttsa/shared";
import type { ColumnDef, PaginationState } from "@tanstack/react-table";
import { PageHeader, StatCard } from "@/components/admin/shell";
import { DataTable, fmtDate, truncate } from "@/components/admin/data-table";
import { BarChartCard, LineChartCard } from "@/components/admin/charts";

const ACCENT = "var(--color-accent)";

function fmtMs(ms: number): string {
  if (!ms) return "—";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(ms < 10000 ? 2 : 1)} s`;
}

async function fetchOverview(): Promise<AdminGenerationOverview> {
  const res = await fetch("/api/admin/generations/overview");
  if (!res.ok) throw new Error("failed");
  return res.json();
}

async function fetchGenerations(params: {
  page: number;
  pageSize: number;
  model?: string;
  failedOnly: boolean;
}): Promise<AdminGenerationsResponse> {
  const sp = new URLSearchParams({
    page: String(params.page),
    pageSize: String(params.pageSize),
  });
  if (params.model) sp.set("model", params.model);
  if (params.failedOnly) sp.set("failed", "1");
  const res = await fetch(`/api/admin/generations?${sp}`);
  if (!res.ok) throw new Error("failed");
  return res.json();
}

export default function AdminGenerationsPage() {
  const { data: ov } = useQuery({
    queryKey: ["admin", "generations", "overview"],
    queryFn: fetchOverview,
    refetchInterval: 30_000,
  });

  return (
    <div>
      <PageHeader
        title="Generations"
        subtitle="Synthesis latency, throughput, and reliability per model."
      />

      {!ov ? (
        <p className="text-sm text-ink-3">Loading…</p>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <StatCard label="Gens 24h" value={ov.last24h.toLocaleString()} />
            <StatCard label="Gens 7d" value={ov.last7d.toLocaleString()} />
            <StatCard
              label="Success 7d"
              value={`${ov.successRate7d.toFixed(1)}%`}
            />
            <StatCard
              label="P50 latency"
              value={fmtMs(ov.p50)}
              hint="last 7d"
            />
            <StatCard
              label="P95 latency"
              value={fmtMs(ov.p95)}
              hint="last 7d"
            />
          </div>

          {/* Latency over time */}
          <LineChartCard
            title="Latency per day (P50 / P95, ms, 30d)"
            data={ov.byDay.map((d) => ({
              date: d.date,
              p50: d.p50,
              p95: d.p95,
            }))}
            xKey="date"
            height={240}
            series={[
              { key: "p50", label: "P50", color: ACCENT },
              { key: "p95", label: "P95", color: "#f59e0b" },
            ]}
          />

          {/* Throughput */}
          <BarChartCard
            title="Generations per day (total vs failed, 30d)"
            data={ov.byDay.map((d) => ({
              date: d.date,
              ok: d.total - d.failures,
              failed: d.failures,
            }))}
            xKey="date"
            stacked
            height={220}
            series={[
              { key: "ok", label: "Succeeded", color: ACCENT },
              { key: "failed", label: "Failed", color: "#ef4444" },
            ]}
          />

          <ModelLatencyTable rows={ov.byModel} />

          {/* Recent failures */}
          <div className="card overflow-hidden">
            <p className="tag border-b border-line px-4 py-3">
              Recent failed generations
            </p>
            <ul className="divide-y divide-line">
              {ov.recentFailures.length === 0 && (
                <li className="px-4 py-6 text-center text-sm text-ink-3">
                  No recent failures.
                </li>
              )}
              {ov.recentFailures.map((g) => (
                <li key={g.id} className="px-4 py-2.5 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-ink-2">
                      {g.model}
                      <span className="ml-1.5 text-ink-4">{g.provider}</span>
                    </span>
                    <span className="tag whitespace-nowrap">
                      {fmtMs(g.durationMs)} · {fmtDate(g.createdAt)}
                    </span>
                  </div>
                  {g.error && (
                    <p className="mt-0.5 truncate font-mono text-xs text-accent">
                      {g.status ? `[${g.status}] ` : ""}
                      {g.error}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <GenerationLog models={ov.byModel.map((m) => m.model)} />
        </div>
      )}
    </div>
  );
}

function ModelLatencyTable({ rows }: { rows: AdminGenModelStat[] }) {
  const columns = useMemo<ColumnDef<AdminGenModelStat, unknown>[]>(
    () => [
      {
        accessorKey: "model",
        header: "Model",
        cell: (c) => (
          <span className="font-medium">
            {c.row.original.model}
            <span className="ml-1.5 text-xs text-ink-4">
              {c.row.original.provider}
            </span>
          </span>
        ),
      },
      {
        accessorKey: "total",
        header: "Gens",
        cell: (c) => <span className="nums">{c.row.original.total}</span>,
      },
      {
        accessorKey: "successRate",
        header: "Success",
        cell: (c) => {
          const s = c.row.original.successRate;
          return (
            <span
              className={`nums font-medium ${
                s >= 98 ? "" : s >= 90 ? "text-amber-500" : "text-accent"
              }`}
            >
              {s.toFixed(1)}%
            </span>
          );
        },
      },
      {
        accessorKey: "p50",
        header: "P50",
        cell: (c) => <span className="nums">{fmtMs(c.row.original.p50)}</span>,
      },
      {
        accessorKey: "p95",
        header: "P95",
        cell: (c) => (
          <span className="nums font-medium">{fmtMs(c.row.original.p95)}</span>
        ),
      },
      {
        accessorKey: "avg",
        header: "Avg",
        cell: (c) => <span className="nums">{fmtMs(c.row.original.avg)}</span>,
      },
    ],
    [],
  );

  return (
    <div className="flex flex-col gap-2">
      <p className="tag">Latency &amp; reliability by model (7d)</p>
      <DataTable
        columns={columns}
        data={rows}
        emptyMessage="No generations in the last 7 days."
        pageSizeOptions={[25, 50]}
      />
    </div>
  );
}

function GenerationLog({ models }: { models: string[] }) {
  const [model, setModel] = useState("");
  const [failedOnly, setFailedOnly] = useState(false);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 50,
  });

  const { data, isLoading, isFetching } = useQuery({
    queryKey: [
      "admin",
      "generations",
      "list",
      pagination.pageIndex,
      pagination.pageSize,
      model,
      failedOnly,
    ],
    queryFn: () =>
      fetchGenerations({
        page: pagination.pageIndex,
        pageSize: pagination.pageSize,
        model: model || undefined,
        failedOnly,
      }),
    placeholderData: keepPreviousData,
  });

  const pageCount = data
    ? Math.max(1, Math.ceil(data.total / pagination.pageSize))
    : 1;
  const resetPage = () => setPagination((p) => ({ ...p, pageIndex: 0 }));

  const columns = useMemo<ColumnDef<AdminGenerationRow, unknown>[]>(
    () => [
      {
        accessorKey: "createdAt",
        header: "When",
        enableSorting: false,
        cell: (c) => (
          <span className="tag whitespace-nowrap">
            {fmtDate(c.row.original.createdAt)}
          </span>
        ),
      },
      {
        accessorKey: "model",
        header: "Model",
        enableSorting: false,
        cell: (c) => (
          <span className="font-medium">
            {c.row.original.model}
            <span className="ml-1.5 text-xs text-ink-4">
              {c.row.original.provider}
            </span>
          </span>
        ),
      },
      {
        accessorKey: "durationMs",
        header: "Latency",
        enableSorting: false,
        cell: (c) => (
          <span className="nums">{fmtMs(c.row.original.durationMs)}</span>
        ),
      },
      {
        id: "status",
        header: "Result",
        enableSorting: false,
        cell: (c) =>
          c.row.original.success ? (
            <span className="text-accent">✓</span>
          ) : (
            <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent">
              failed
            </span>
          ),
      },
      {
        accessorKey: "textLength",
        header: "Chars",
        enableSorting: false,
        cell: (c) => (
          <span className="nums text-ink-3">
            {c.row.original.textLength ?? "—"}
          </span>
        ),
      },
      {
        accessorKey: "error",
        header: "Error",
        enableSorting: false,
        cell: (c) =>
          c.row.original.error ? (
            <span className="font-mono text-xs text-ink-3">
              {truncate(c.row.original.error, 56)}
            </span>
          ) : (
            <span className="text-ink-4">—</span>
          ),
      },
    ],
    [],
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="tag mr-auto">Generation log</p>
        <select
          value={model}
          onChange={(e) => {
            setModel(e.target.value);
            resetPage();
          }}
          className="rounded-md border border-line bg-transparent px-2 py-1.5 text-sm text-ink-2 outline-none"
        >
          <option value="">All models</option>
          {models.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-ink-2">
          <input
            type="checkbox"
            checked={failedOnly}
            onChange={(e) => {
              setFailedOnly(e.target.checked);
              resetPage();
            }}
          />
          Failed only
        </label>
      </div>

      <DataTable
        columns={columns}
        data={data?.rows ?? []}
        manualPagination
        pageCount={pageCount}
        pagination={pagination}
        onPaginationChange={setPagination}
        loading={isLoading || isFetching}
        emptyMessage="No generations."
        pageSizeOptions={[50, 100]}
      />
    </div>
  );
}
