"use client";

import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type PaginationState,
  type OnChangeFn,
} from "@tanstack/react-table";
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * One table component the whole admin reuses. Headless TanStack Table rendered
 * as a semantic <table> styled with the app's tokens. Two pagination modes:
 *  - client (default): pass all rows, the table paginates/sorts in memory.
 *  - server (manualPagination + pageCount + pagination/onPaginationChange):
 *    the caller fetches each page; the table just renders + emits page changes.
 */
export function DataTable<T>({
  columns,
  data,
  // server pagination
  manualPagination,
  pageCount,
  pagination,
  onPaginationChange,
  // ui
  loading,
  emptyMessage = "No rows.",
  onRowClick,
  pageSizeOptions = [25, 50, 100],
}: {
  columns: ColumnDef<T, unknown>[];
  data: T[];
  manualPagination?: boolean;
  pageCount?: number;
  pagination?: PaginationState;
  onPaginationChange?: OnChangeFn<PaginationState>;
  loading?: boolean;
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
  pageSizeOptions?: number[];
}) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [clientPagination, setClientPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: pageSizeOptions[0] ?? 25,
  });

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      pagination: manualPagination ? pagination : clientPagination,
    },
    onSortingChange: setSorting,
    onPaginationChange: manualPagination
      ? onPaginationChange
      : setClientPagination,
    manualPagination: manualPagination ?? false,
    pageCount: manualPagination ? pageCount : undefined,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: manualPagination ? undefined : getSortedRowModel(),
    getPaginationRowModel: manualPagination
      ? undefined
      : getPaginationRowModel(),
  });

  const state = table.getState().pagination;
  const totalPages = manualPagination ? (pageCount ?? 1) : table.getPageCount();

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b border-line">
                {hg.headers.map((header) => {
                  const sortable = header.column.getCanSort();
                  const dir = header.column.getIsSorted();
                  return (
                    <th
                      key={header.id}
                      className="px-3 py-2.5 text-left align-middle"
                    >
                      {header.isPlaceholder ? null : (
                        <button
                          type="button"
                          disabled={!sortable}
                          onClick={header.column.getToggleSortingHandler()}
                          className={`tag flex items-center gap-1 ${
                            sortable ? "hover:text-ink" : "cursor-default"
                          }`}
                        >
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                          {dir === "asc" && <span aria-hidden>↑</span>}
                          {dir === "desc" && <span aria-hidden>↓</span>}
                        </button>
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-3 py-10 text-center text-sm text-ink-3"
                >
                  Loading…
                </td>
              </tr>
            ) : table.getRowModel().rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-3 py-10 text-center text-sm text-ink-3"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={
                    onRowClick ? () => onRowClick(row.original) : undefined
                  }
                  className={`border-b border-line/60 last:border-0 ${
                    onRowClick
                      ? "cursor-pointer transition-colors hover:bg-fill/60"
                      : ""
                  }`}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-3 py-2.5 align-middle">
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination footer */}
      <div className="flex items-center justify-between gap-3 border-t border-line px-3 py-2.5">
        <span className="tag">
          Page {state.pageIndex + 1} of {Math.max(1, totalPages)}
        </span>
        <div className="flex items-center gap-2">
          <select
            value={state.pageSize}
            onChange={(e) => table.setPageSize(Number(e.target.value))}
            className="rounded-md border border-line bg-transparent px-2 py-1 text-xs text-ink-2 outline-none"
          >
            {pageSizeOptions.map((n) => (
              <option key={n} value={n}>
                {n}/page
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            className="flex items-center gap-1 rounded-md bg-fill px-2.5 py-1 text-xs font-medium transition-colors hover:bg-line disabled:opacity-40"
          >
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> Prev
          </button>
          <button
            type="button"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            className="flex items-center gap-1 rounded-md bg-fill px-2.5 py-1 text-xs font-medium transition-colors hover:bg-line disabled:opacity-40"
          >
            Next <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Small formatters reused by columns ──────────────────────────────── */

/** Format a unix-epoch-seconds timestamp as a compact local date-time. */
export function fmtDate(epochSeconds: number): string {
  if (!epochSeconds) return "—";
  const d = new Date(epochSeconds * 1000);
  return d.toLocaleString(undefined, {
    year: "2-digit",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function truncate(s: string, n = 60): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
