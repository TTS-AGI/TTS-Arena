"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useAuth } from "./auth";
import { SNAP } from "./motion";
import { HFLogo } from "./hf-logo";

/** Header account chip: signed-out → "Sign in"; signed-in → avatar + menu. */
export function Account() {
  const { user, requireAuth, signOut } = useAuth();
  const [menu, setMenu] = useState(false);

  if (!user) {
    return (
      <button
        onClick={() => requireAuth()}
        className="flex items-center gap-1.5 rounded-full bg-fill px-3.5 py-1.5 text-sm font-medium transition-colors hover:bg-line"
      >
        <HFLogo className="h-4 w-4" /> Sign in
      </button>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setMenu((v) => !v)}
        className="flex items-center gap-2 rounded-full bg-fill py-1 pr-3 pl-1 transition-colors hover:bg-line"
      >
        <Avatar
          src={user.avatarUrl}
          username={user.username}
          className="h-6 w-6 text-[0.65rem]"
        />
        <span className="text-sm font-medium">@{user.username}</span>
      </button>

      <AnimatePresence>
        {menu && (
          <>
            <button
              className="fixed inset-0 z-40 cursor-default"
              onClick={() => setMenu(false)}
              aria-hidden
            />
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.98 }}
              transition={SNAP}
              className="card absolute right-0 z-50 mt-2 w-48 p-1.5 shadow-[0_16px_40px_-16px_rgba(0,0,0,0.3)]"
            >
              <div className="flex items-center gap-2.5 px-2.5 py-2">
                <Avatar
                  src={user.avatarUrl}
                  username={user.username}
                  className="h-8 w-8 text-xs"
                />
                <p className="truncate text-sm leading-tight font-semibold">
                  @{user.username}
                </p>
              </div>
              {user.isAdmin && (
                <Link
                  href="/admin"
                  onClick={() => setMenu(false)}
                  className="block w-full rounded-lg px-2.5 py-2 text-left text-sm text-ink-2 transition-colors hover:bg-fill hover:text-ink"
                >
                  Admin panel
                </Link>
              )}
              <form action="/api/auth/logout" method="post">
                <button
                  type="submit"
                  formTarget="_blank"
                  onClick={() => {
                    void signOut();
                    setMenu(false);
                  }}
                  className="w-full rounded-lg px-2.5 py-2 text-left text-sm text-ink-2 transition-colors hover:bg-fill hover:text-ink"
                >
                  Sign out
                </button>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

/** HF avatar with an initials fallback (used when there's no URL or it fails). */
function Avatar({
  src,
  username,
  className = "",
}: {
  src: string | null;
  username: string;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  const initials = username.slice(0, 2).toUpperCase();

  if (src && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={username}
        onError={() => setBroken(true)}
        className={`shrink-0 rounded-full object-cover ${className}`}
      />
    );
  }
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-full bg-accent font-semibold text-on-accent ${className}`}
    >
      {initials}
    </span>
  );
}
