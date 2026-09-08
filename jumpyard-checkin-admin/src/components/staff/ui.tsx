"use client";

import Image from "next/image";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

export type IconName =
  | "addons-bag"
  | "admission-ticket"
  | "booking-card"
  | "combo-pizza"
  | "drink-cup"
  | "grip-socks"
  | "group"
  | "info"
  | "jump"
  | "padlock"
  | "payment-card"
  | "profile"
  | "safety-check"
  | "success-check"
  | "time"
  | "visitor-wristband"
  | "water-bottle"
  | "zipline";

/** Existing JumpYard image icons. The PNGs carry padding, so they are scaled up like in the production staff page. */
export function Icon({ name, className = "h-8 w-8" }: { name: IconName | string; className?: string }) {
  return (
    <Image
      src={`/jumpyard-next-icons/${name}.png`}
      alt=""
      width={48}
      height={48}
      aria-hidden="true"
      className={`shrink-0 origin-center scale-125 object-contain ${className}`}
    />
  );
}

/** Class recipes copied from the production staff page so the preview inherits its typography and controls. */
export const cls = {
  primary:
    "flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-primary px-4 text-sm font-black italic uppercase text-white shadow-sm transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:bg-surface-strong disabled:text-foreground/45",
  outline:
    "flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-border bg-white px-4 text-sm font-black italic uppercase text-foreground shadow-sm transition hover:border-primary hover:text-primary",
  text: "min-h-9 shrink-0 text-xs font-bold italic text-foreground transition hover:text-primary",
  label: "text-[10px] font-black italic uppercase tracking-[0.22em] text-foreground",
  icon: "grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-border bg-white text-foreground transition hover:border-primary hover:text-primary",
};

export function Modal({ title, children, close }: { title: string; children: ReactNode; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={close}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
      className="fixed inset-0 m-auto max-h-[calc(100dvh-1.5rem)] w-[calc(100%-1.5rem)] max-w-md overflow-auto rounded-3xl border border-border bg-white p-4 text-foreground shadow-sm backdrop:bg-black/40 sm:p-5"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id={titleId} className="text-xl font-black italic uppercase leading-none">{title}</h2>
        <button type="button" className={cls.icon} aria-label="Stäng" onClick={close}>
          <X size={18} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
