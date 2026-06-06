"use client";

import { useState } from "react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type {
  AdminTestRun,
  AdminTestRunDetail,
  AdminTestRunsResponse,
  AdminTestResult,
} from "@ttsa/shared";
import { Play, Loader2, CheckCircle2, XCircle, Clock } from "lucide-react";
import { Modal, ModalTitle } from "@/components/modal";
import { fmtDate } from "@/components/admin/data-table";
import { useToast } from "@/components/toast";

/* ── Data hooks ───────────────────────────────────────────────────────── */

async function fetchRuns(page: number): Promise<AdminTestRunsResponse> {
  const res = await fetch(`/api/admin/tests?page=${page}&pageSize=10`);
  if (!res.ok) throw new Error("failed");
  return res.json();
}

async function fetchRunDetail(id: number): Promise<AdminTestRunDetail> {
  const res = await fetch(`/api/admin/tests/${id}`);
  if (!res.ok) throw new Error("failed");
  return res.json();
}

/* ── Panel ────────────────────────────────────────────────────────────── */

export function TestAllPanel() {
  const qc = useQueryClient();
  const toast = useToast();
  const [page, setPage] = useState(0);
  const [openRun, setOpenRun] = useState<number | null>(null);

  const { data: runs } = useQuery({
    queryKey: ["admin", "tests", "runs", page],
    queryFn: () => fetchRuns(page),
    placeholderData: keepPreviousData,
    // Refetch while any run is active so progress/history stay live.
    refetchInterval: (q) =>
      q.state.data?.rows.some((r) => r.status === "running") ? 2000 : 15000,
  });

  const activeRun = runs?.rows.find((r) => r.status === "running");

  const startMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/tests", { method: "POST" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "failed");
      }
      return res.json() as Promise<{ runId: number }>;
    },
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["admin", "tests", "runs"] });
      setOpenRun(d.runId);
      toast.success("Test run started");
    },
    onError: (e) => toast.error("Couldn’t start test", (e as Error).message),
  });

  const pageCount = runs ? Math.max(1, Math.ceil(runs.total / 10)) : 1;

  return (
    <div className="card flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-semibold">Test All</p>
          <p className="text-sm text-ink-3">
            Synthesize one sentence on every model and record pass/fail.
          </p>
        </div>
        <button
          onClick={() => startMutation.mutate()}
          disabled={startMutation.isPending || !!activeRun}
          className="flex shrink-0 items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm font-medium text-canvas transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {activeRun ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Running…
            </>
          ) : (
            <>
              <Play className="h-4 w-4" /> Test All
            </>
          )}
        </button>
      </div>

      {/* Inline live progress for the active run. */}
      {activeRun && (
        <button
          onClick={() => setOpenRun(activeRun.id)}
          className="rounded-lg bg-fill/60 p-3 text-left transition-colors hover:bg-fill"
        >
          <RunProgress run={activeRun} />
          <p className="mt-1 text-xs text-accent">Watch live →</p>
        </button>
      )}

      {/* History */}
      <div className="overflow-hidden rounded-lg border border-line">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left">
              <th className="px-3 py-2">
                <span className="tag">When</span>
              </th>
              <th className="px-3 py-2">
                <span className="tag">Status</span>
              </th>
              <th className="px-3 py-2">
                <span className="tag">Result</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {!runs ? (
              <tr>
                <td colSpan={3} className="px-3 py-6 text-center text-ink-3">
                  Loading…
                </td>
              </tr>
            ) : runs.rows.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-3 py-6 text-center text-ink-3">
                  No test runs yet.
                </td>
              </tr>
            ) : (
              runs.rows.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => setOpenRun(r.id)}
                  className="cursor-pointer border-b border-line/60 transition-colors last:border-0 hover:bg-fill/60"
                >
                  <td className="px-3 py-2">
                    <span className="tag whitespace-nowrap">
                      {fmtDate(r.createdAt)}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <RunStatusBadge status={r.status} />
                  </td>
                  <td className="px-3 py-2">
                    <span className="nums">
                      <span className="text-emerald-500">{r.passed}✓</span>{" "}
                      <span className={r.failed ? "text-accent" : "text-ink-4"}>
                        {r.failed}✗
                      </span>{" "}
                      <span className="text-ink-4">/ {r.total}</span>
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        {runs && pageCount > 1 && (
          <div className="flex items-center justify-between border-t border-line px-3 py-2">
            <span className="tag">
              Page {page + 1} of {pageCount}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="rounded-md bg-fill px-2.5 py-1 text-xs font-medium hover:bg-line disabled:opacity-40"
              >
                Prev
              </button>
              <button
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                disabled={page >= pageCount - 1}
                className="rounded-md bg-fill px-2.5 py-1 text-xs font-medium hover:bg-line disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      <RunDetailModal runId={openRun} onClose={() => setOpenRun(null)} />
    </div>
  );
}

function RunProgress({ run }: { run: AdminTestRun }) {
  const pct = run.total ? Math.round((run.completed / run.total) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">
          Testing… {run.completed}/{run.total}
        </span>
        <span className="nums text-ink-3">{pct}%</span>
      </div>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-line">
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function RunStatusBadge({ status }: { status: string }) {
  if (status === "running")
    return (
      <span className="inline-flex items-center gap-1 text-amber-500">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> running
      </span>
    );
  if (status === "interrupted")
    return <span className="text-ink-3">interrupted</span>;
  return (
    <span className="inline-flex items-center gap-1 text-emerald-500">
      <CheckCircle2 className="h-3.5 w-3.5" /> done
    </span>
  );
}

/* ── Run detail (live results + playback + per-model time-out) ─────────── */

function RunDetailModal({
  runId,
  onClose,
}: {
  runId: number | null;
  onClose: () => void;
}) {
  const { data } = useQuery({
    queryKey: ["admin", "tests", "detail", runId],
    queryFn: () => fetchRunDetail(runId!),
    enabled: runId !== null,
    refetchInterval: (q) =>
      q.state.data?.run.status === "running" ? 1500 : false,
  });

  return (
    <Modal
      open={runId !== null}
      onClose={onClose}
      size="lg"
      className="max-h-[85vh] overflow-y-auto"
    >
      {data && (
        <div className="flex flex-col gap-4">
          <div>
            <ModalTitle>Test run #{data.run.id}</ModalTitle>
            <p className="mt-1 text-sm text-ink-3">
              {fmtDate(data.run.createdAt)} ·{" "}
              <span className="text-emerald-500">{data.run.passed} passed</span>
              ,{" "}
              <span className={data.run.failed ? "text-accent" : ""}>
                {data.run.failed} failed
              </span>{" "}
              of {data.run.total}
            </p>
          </div>

          {data.run.status === "running" && <RunProgress run={data.run} />}

          <ul className="flex flex-col divide-y divide-line">
            {data.results.map((r) => (
              <ResultRow key={r.id} r={r} />
            ))}
          </ul>
        </div>
      )}
    </Modal>
  );
}

function ResultRow({ r }: { r: AdminTestResult }) {
  return (
    <li className="flex items-center gap-3 py-2.5">
      <ResultIcon status={r.status} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {r.modelName}
          {r.provider && (
            <span className="ml-1.5 text-xs text-ink-4">{r.provider}</span>
          )}
        </p>
        {r.error && (
          <p className="truncate font-mono text-xs text-accent">{r.error}</p>
        )}
      </div>
      {r.durationMs != null && (
        <span className="nums shrink-0 text-xs text-ink-3">
          {(r.durationMs / 1000).toFixed(2)}s
        </span>
      )}
      {r.audioUrl && (
        <audio
          controls
          preload="none"
          src={r.audioUrl}
          className="h-8 w-44 shrink-0"
        />
      )}
    </li>
  );
}

function ResultIcon({ status }: { status: string }) {
  const cls = "h-4 w-4 shrink-0";
  if (status === "pass")
    return <CheckCircle2 className={`${cls} text-emerald-500`} aria-hidden />;
  if (status === "fail")
    return <XCircle className={`${cls} text-accent`} aria-hidden />;
  if (status === "running")
    return (
      <Loader2 className={`${cls} animate-spin text-amber-500`} aria-hidden />
    );
  return <Clock className={`${cls} text-ink-4`} aria-hidden />;
}
