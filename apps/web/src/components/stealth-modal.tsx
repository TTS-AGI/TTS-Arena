"use client";

import { EyeOff, ArrowRight } from "lucide-react";
import { Modal, ModalTitle, ModalDescription } from "./modal";

const DISCORD_URL = "https://discord.gg/HB8fMR6GTr";

/**
 * Shown when a user clicks a stealth (anonymous pre-release) model on the
 * leaderboard. Its identity is deliberately hidden, so instead of a dead link
 * we explain that and point to Discord for reveal/announcement updates.
 */
export function StealthModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose} size="sm" center>
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-fill text-ink-2">
        <EyeOff className="h-6 w-6" aria-hidden />
      </span>
      <ModalTitle className="mt-4">This is a stealth model</ModalTitle>
      <ModalDescription className="mx-auto mt-1.5 max-w-[18rem] leading-relaxed text-ink-2">
        It’s being evaluated anonymously before release, so its identity is kept
        hidden for now. Join our Discord to be the first to know when it’s
        revealed and what else is coming.
      </ModalDescription>

      <a
        href={DISCORD_URL}
        target="_blank"
        rel="noreferrer"
        onClick={onClose}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-[#5865F2] px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
      >
        Join the Discord
        <ArrowRight className="h-4 w-4" aria-hidden />
      </a>
      <button
        onClick={onClose}
        className="mt-2 w-full rounded-full px-4 py-2 text-sm text-ink-3 transition-colors hover:text-ink"
      >
        Close
      </button>
    </Modal>
  );
}
