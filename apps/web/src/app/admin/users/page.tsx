"use client";

import { useEffect, useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import type { AdminUserRow, AdminUsersResponse } from "@ttsa/shared";
import type { ColumnDef, PaginationState } from "@tanstack/react-table";
import { PageHeader } from "@/components/admin/shell";
import { DataTable, fmtDate } from "@/components/admin/data-table";

async function fetchUsers(
  page: number,
  pageSize: number,
  search: string,
): Promise<AdminUsersResponse> {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });
  if (search) params.set("search", search);
  const res = await fetch(`/api/admin/users?${params}`);
  if (!res.ok) throw new Error("failed");
  return res.json();
}

export default function AdminUsersPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 25,
  });

  // Debounce the search box; reset to page 0 when the query changes.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search);
      setPagination((p) => ({ ...p, pageIndex: 0 }));
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: [
      "admin",
      "users",
      pagination.pageIndex,
      pagination.pageSize,
      debounced,
    ],
    queryFn: () =>
      fetchUsers(pagination.pageIndex, pagination.pageSize, debounced),
    placeholderData: keepPreviousData,
  });

  const pageCount = data
    ? Math.max(1, Math.ceil(data.total / pagination.pageSize))
    : 1;

  const columns = useMemo<ColumnDef<AdminUserRow, unknown>[]>(
    () => [
      {
        accessorKey: "username",
        header: "User",
        enableSorting: false,
        cell: (c) => (
          <div className="flex items-center gap-2.5">
            {c.row.original.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={c.row.original.avatarUrl}
                alt=""
                className="h-6 w-6 rounded-full object-cover"
              />
            ) : (
              <span className="h-6 w-6 rounded-full bg-fill" />
            )}
            <span className="font-medium">{c.row.original.username}</span>
          </div>
        ),
      },
      {
        accessorKey: "voteCount",
        header: "Votes",
        enableSorting: false,
        cell: (c) => <span className="nums">{c.row.original.voteCount}</span>,
      },
      {
        accessorKey: "email",
        header: "Email",
        enableSorting: false,
        cell: (c) => (
          <span className="text-ink-3">{c.row.original.email ?? "—"}</span>
        ),
      },
      {
        accessorKey: "joinDate",
        header: "Joined",
        enableSorting: false,
        cell: (c) => (
          <span className="tag">{fmtDate(c.row.original.joinDate)}</span>
        ),
      },
    ],
    [],
  );

  return (
    <div>
      <PageHeader
        title="Users"
        subtitle={data ? `${data.total.toLocaleString()} users` : undefined}
        actions={
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search username…"
            className="input w-56"
          />
        }
      />
      <DataTable
        columns={columns}
        data={data?.rows ?? []}
        manualPagination
        pageCount={pageCount}
        pagination={pagination}
        onPaginationChange={setPagination}
        loading={isLoading || isFetching}
        emptyMessage="No users match."
        onRowClick={(u) => router.push(`/admin/users/${u.id}`)}
      />
    </div>
  );
}
