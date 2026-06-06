/**
 * Admin section layout. Server-gated: only users in ADMIN_USERS reach it;
 * everyone else is redirected to the arena. Wraps the admin UI in the Query
 * provider and the sidebar shell.
 */
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentAdmin } from "@/server/auth/admin";
import { toApiUser } from "@/server/auth/user";
import { AdminProviders } from "./providers";
import { AdminShell } from "@/components/admin/shell";

export const metadata: Metadata = {
  title: "Admin · TTS Arena",
  robots: { index: false, follow: false },
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await currentAdmin();
  if (!admin) redirect("/");

  return (
    <AdminProviders>
      <AdminShell user={toApiUser(admin)}>{children}</AdminShell>
    </AdminProviders>
  );
}
