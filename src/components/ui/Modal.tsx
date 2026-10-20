"use client";

import {
  useEffect,
  useRef,
  type DialogHTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from "react";

interface ModalProps
  extends Omit<DialogHTMLAttributes<HTMLDialogElement>, "open" | "onClose"> {
  /** Controls visibility. Conditionally-mounted modals can leave this at true. */
  open?: boolean;
  /** Called on Escape or backdrop click (when dismissible). */
  onClose?: () => void;
  /** When false, Escape and backdrop clicks do nothing. */
  dismissible?: boolean;
  /** Keep the dialog open this long after `open` flips to false (exit animation). */
  exitMs?: number;
  children: ReactNode;
}

function show(d: HTMLDialogElement) {
  if (d.open) return;
  if (typeof d.showModal === "function") d.showModal();
  // Fallback for environments without a working showModal (e.g. jsdom).
  if (!d.open) d.setAttribute("open", "");
}

function hide(d: HTMLDialogElement) {
  if (typeof d.close === "function") d.close();
  d.removeAttribute("open");
}

/**
 * Native <dialog> opened with showModal(): focus moves in and is trapped, Escape
 * closes, the page behind is inert (and scroll-locked via globals.css), and
 * focus returns to the trigger on close.
 */
export function Modal({
  open = true,
  onClose,
  dismissible = true,
  exitMs = 0,
  children,
  ...rest
}: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const d = ref.current;
    if (!d || !open) return;
    clearTimeout(timer.current);
    const prev = document.activeElement as HTMLElement | null;
    show(d);
    return () => {
      const done = () => {
        hide(d);
        if (prev?.isConnected) prev.focus();
      };
      if (exitMs > 0) timer.current = setTimeout(done, exitMs);
      else done();
    };
  }, [open, exitMs]);

  const handleClick = (e: MouseEvent<HTMLDialogElement>) => {
    if (!dismissible || e.target !== e.currentTarget) return;
    // Clicks on ::backdrop target the dialog itself, outside its box.
    const r = e.currentTarget.getBoundingClientRect();
    const outside =
      e.clientX < r.left ||
      e.clientX > r.right ||
      e.clientY < r.top ||
      e.clientY > r.bottom;
    if (outside) onClose?.();
  };

  return (
    <dialog
      ref={ref}
      role="dialog"
      aria-modal="true"
      onCancel={(e) => {
        e.preventDefault();
        if (dismissible) onClose?.();
      }}
      onClick={handleClick}
      {...rest}
    >
      {children}
    </dialog>
  );
}
