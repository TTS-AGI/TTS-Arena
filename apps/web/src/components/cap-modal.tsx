"use client";

import HCaptcha from "@hcaptcha/react-hcaptcha";
import { Modal, ModalTitle, ModalDescription } from "./modal";

/**
 * hCaptcha challenge in a modal. Shown when the server asks for a captcha (first
 * vote of a session, then risk-triggered). The widget produces a response token
 * on solve, which we hand back via onSolved; the server validates it against
 * hCaptcha's siteverify (see server/security/hcaptcha.ts).
 *
 * The sitekey is public by design (it ships in client HTML) — safe to inline.
 */
const HCAPTCHA_SITEKEY = "4f146700-8df8-4d7a-978c-4eb6f0ec55e4";

export function CapModal({
  open,
  onSolved,
  onClose,
}: {
  open: boolean;
  onSolved: (token: string) => void;
  onClose: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose} size="sm" center>
      <ModalTitle className="text-base">Quick check</ModalTitle>
      <ModalDescription className="mx-auto mt-1 max-w-[16rem] leading-relaxed text-ink-2">
        Please verify you are a human to continue.
      </ModalDescription>
      <div className="mt-4 flex min-h-[78px] justify-center">
        {/* key={String(open)} remounts a fresh challenge each time the modal
            opens, so a stale/used token can't suppress a new solve. */}
        {open && (
          <HCaptcha
            key={String(open)}
            sitekey={HCAPTCHA_SITEKEY}
            onVerify={(token) => onSolved(token)}
          />
        )}
      </div>
    </Modal>
  );
}
