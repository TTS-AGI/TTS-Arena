"use client";

import { useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Dialog } from "@base-ui-components/react/dialog";
import type {
  AdminErrorOverview,
  AdminErrorRow,
  AdminErrorsResponse,
} from "@ttsa/shared";
import type { ColumnDef, PaginationState } from "@tanstack/react-table";
import { PageHeader, StatCard } from "@/components/admin/shell";
import { DataTable, fmtDate, truncate } from "@/components/admin/data-table";
import { BarChartCard, HBarChartCard } from "@/components/admin/charts";

/* A small fixed palette so each source gets a stable color in the stacked chart. */
const PALETTE = [
  "var(--color-accent)",
  "#f59e0b",
  "#3b82f6",
  "#10b981",
  "#a855f7",
  "#ef4444",
  "#14b8a6",
  "#eab308",
  "#ec4899",
  "#6366f1",
];

const SEV_COLOR: Record<string, string> = {
  fatal: "text-accent",
  error: "text-accent",
  warn: "text-amber-500",
};

async function fetchOverview(): Promise<AdminErrorOverview> {
  const res = await fetch("/api/admin/errors/overview");
  if (!res.ok) throw new Error("failed");
  return res.json();
}

async function fetchErrors(params: {
  page: number;
  pageSize: number;
  source?: string;
  severity?: string;
  search?: string;
}): Promise<AdminErrorsResponse> {
  const sp = new URLSearchParams({
    page: String(params.page),
    pageSize: String(params.pageSize),
  });
  if (params.source) sp.set("source", params.source);
  if (params.severity) sp.set("severity", params.severity);
  if (params.search) sp.set("search", params.search);
  const res = await fetch(`/api/admin/errors?${sp}`);
  if (!res.ok) throw new Error("failed");
  return res.json();
}

export default function AdminErrorsPage() {
  const { data: ov } = useQuery({
    queryKey: ["admin", "errors", "overview"],
    queryFn: fetchOverview,
    refetchInterval: 30_000,
  });

  return (
    <div>
      <PageHeader
        title="Errors"
        subtitle="Application errors across services — trends, failing models, and a searchable log."
      />

      {!ov ? (
        <p className="text-sm text-ink-3">Loading…</p>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Last 24h" value={ov.last24h.toLocaleString()} />
            <StatCard label="Last 7d" value={ov.last7d.toLocaleString()} />
            <StatCard
              label="Distinct sources"
              value={ov.distinctSources.toLocaleString()}
            />
            <StatCard
              label="Top failing model"
              value={
                ov.topFailingModel
                  ? `${truncate(ov.topFailingModel.model, 16)}`
                  : "—"
              }
              hint={
                ov.topFailingModel
                  ? `${ov.topFailingModel.count} in 7d`
                  : undefined
              }
            />
          </div>

          {/* Errors per day, stacked by source */}
          <BarChartCard
            title="Errors per day (by source, 30d)"
            data={ov.errorsByDay.map((d) => ({ date: d.date, ...d.bySource }))}
            xKey="date"
            stacked
            height={240}
            series={ov.sources.map((s, i) => ({
              key: s,
              label: s,
              color: PALETTE[i % PALETTE.length],
            }))}
          />

          <div className="grid gap-4 lg:grid-cols-2">
            {ov.byModel.length > 0 ? (
              <HBarChartCard
                title="Failures by model (7d)"
                data={ov.byModel.map((m) => ({
                  model: truncate(m.model, 18),
                  count: m.count,
                }))}
                labelKey="model"
                valueKey="count"
              />
            ) : (
              <EmptyCard title="Failures by model (7d)" />
            )}

            {ov.byProvider.length > 0 ? (
              <HBarChartCard
                title="Failures by provider (7d)"
                data={ov.byProvider.map((p) => ({
                  provider: truncate(p.provider, 18),
                  count: p.count,
                }))}
                labelKey="provider"
                valueKey="count"
                color="#3b82f6"
              />
            ) : (
              <EmptyCard title="Failures by provider (7d)" />
            )}
          </div>

          {/* Breakdown by source */}
          <div className="card p-4">
            <p className="tag mb-3">Errors by source (7d)</p>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {ov.bySource.length === 0 && (
                <li className="text-sm text-ink-3">No errors. Nice.</li>
              )}
              {ov.bySource.map((s) => (
                <li
                  key={s.source}
                  className="flex items-center justify-between rounded-md bg-fill/60 px-3 py-1.5 text-sm"
                >
                  <span className="font-mono text-xs">{s.source}</span>
                  <span className="nums font-medium">{s.count}</span>
                </li>
              ))}
            </ul>
          </div>

          <ErrorLog sources={ov.sources} />
        </div>
      )}
    </div>
  );
}

function EmptyCard({ title }: { title: string }) {
  return (
    <div className="card flex flex-col p-4">
      <p className="tag mb-3">{title}</p>
      <p className="flex-1 text-sm text-ink-3">No data in the window.</p>
    </div>
  );
}

function ErrorLog({ sources }: { sources: string[] }) {
  const [source, setSource] = useState("");
  const [severity, setSeverity] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<AdminErrorRow | null>(null);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 50,
  });

  const { data, isLoading, isFetching } = useQuery({
    queryKey: [
      "admin",
      "errors",
      "list",
      pagination.pageIndex,
      pagination.pageSize,
      source,
      severity,
      search,
    ],
    queryFn: () =>
      fetchErrors({
        page: pagination.pageIndex,
        pageSize: pagination.pageSize,
        source: source || undefined,
        severity: severity || undefined,
        search: search || undefined,
      }),
    placeholderData: keepPreviousData,
  });

  const pageCount = data
    ? Math.max(1, Math.ceil(data.total / pagination.pageSize))
    : 1;

  const resetPage = () => setPagination((p) => ({ ...p, pageIndex: 0 }));

  const columns = useMemo<ColumnDef<AdminErrorRow, unknown>[]>(
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
        accessorKey: "severity",
        header: "Sev",
        enableSorting: false,
        cell: (c) => (
          <span
            className={`text-xs font-medium uppercase ${
              SEV_COLOR[c.row.original.severity] ?? "text-ink-3"
            }`}
          >
            {c.row.original.severity}
          </span>
        ),
      },
      {
        accessorKey: "source",
        header: "Source",
        enableSorting: false,
        cell: (c) => (
          <span className="font-mono text-xs">{c.row.original.source}</span>
        ),
      },
      {
        id: "target",
        header: "Model / Provider",
        enableSorting: false,
        cell: (c) => {
          const r = c.row.original;
          if (!r.model && !r.provider)
            return <span className="text-ink-4">—</span>;
          return (
            <span className="text-ink-2">
              {r.model ?? r.provider}
              {r.status ? (
                <span className="ml-1 text-ink-4">({r.status})</span>
              ) : null}
            </span>
          );
        },
      },
      {
        accessorKey: "message",
        header: "Message",
        enableSorting: false,
        cell: (c) => (
          <span className="text-ink-3">
            {truncate(c.row.original.message, 70)}
          </span>
        ),
      },
    ],
    [],
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            resetPage();
          }}
          placeholder="Search message…"
          className="w-56 rounded-md border border-line bg-transparent px-3 py-1.5 text-sm outline-none focus:border-ink-3"
        />
        <select
          value={source}
          onChange={(e) => {
            setSource(e.target.value);
            resetPage();
          }}
          className="rounded-md border border-line bg-transparent px-2 py-1.5 text-sm text-ink-2 outline-none"
        >
          <option value="">All sources</option>
          {sources.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={severity}
          onChange={(e) => {
            setSeverity(e.target.value);
            resetPage();
          }}
          className="rounded-md border border-line bg-transparent px-2 py-1.5 text-sm text-ink-2 outline-none"
        >
          <option value="">All severities</option>
          <option value="warn">warn</option>
          <option value="error">error</option>
          <option value="fatal">fatal</option>
        </select>
        {data && (
          <span className="tag ml-auto">
            {data.total.toLocaleString()} events
          </span>
        )}
      </div>

      <DataTable
        columns={columns}
        data={data?.rows ?? []}
        manualPagination
        pageCount={pageCount}
        pagination={pagination}
        onPaginationChange={setPagination}
        loading={isLoading || isFetching}
        emptyMessage="No errors match."
        onRowClick={setSelected}
        pageSizeOptions={[50, 100]}
      />

      <ErrorDetailDialog row={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function ErrorDetailDialog({
  row,
  onClose,
}: {
  row: AdminErrorRow | null;
  onClose: () => void;
}) {
  return (
    <Dialog.Root open={!!row} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-ink/30 backdrop-blur-sm" />
        <Dialog.Popup className="card fixed top-1/2 left-1/2 z-50 max-h-[85vh] w-[min(94vw,42rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto p-6 shadow-[0_24px_70px_-20px_rgba(0,0,0,0.35)]">
          {row && (
            <div className="flex flex-col gap-4">
              <div>
                <Dialog.Title className="font-mono text-sm text-ink-3">
                  {row.source}
                  {row.route ? ` · ${row.method ?? ""} ${row.route}` : ""}
                </Dialog.Title>
                <Dialog.Description className="mt-1 text-base font-medium break-words">
                  {row.message}
                </Dialog.Description>
                <p className="tag mt-1">{fmtDate(row.createdAt)}</p>
              </div>

              <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
                <Meta label="Severity" value={row.severity} />
                <Meta label="Provider" value={row.provider} />
                <Meta label="Model" value={row.model} />
                <Meta
                  label="Status"
                  value={row.status != null ? String(row.status) : null}
                />
                <Meta
                  label="User"
                  value={row.userId != null ? String(row.userId) : null}
                />
              </div>

              {row.detail && (
                <div>
                  <p className="tag mb-1.5">Detail</p>
                  <pre className="max-h-40 overflow-auto rounded-md bg-fill/60 p-3 font-mono text-xs whitespace-pre-wrap text-ink-2">
                    {prettyJson(row.detail)}
                  </pre>
                </div>
              )}

              {row.stack && (
                <div>
                  <p className="tag mb-1.5">Stack</p>
                  <pre className="max-h-72 overflow-auto rounded-md bg-fill/60 p-3 font-mono text-xs whitespace-pre-wrap text-ink-2">
                    {row.stack}
                  </pre>
                </div>
              )}

              <div className="flex justify-end">
                <Dialog.Close className="rounded-md bg-fill px-3 py-1.5 text-sm font-medium transition-colors hover:bg-line">
                  Close
                </Dialog.Close>
              </div>
            </div>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Meta({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="tag">{label}</p>
      <p className="text-ink-2">{value || "—"}</p>
    </div>
  );
}

function prettyJson(s: string): string {
  try {
    return JSON.stringify(JSON.parse(s), null, 2);
  } catch {
    return s;
  }
}
