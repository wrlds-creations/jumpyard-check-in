"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import type { IScannerControls } from "@zxing/browser";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Loader2,
  RefreshCcw,
  ScanLine,
  Search,
  TicketCheck,
  X,
} from "lucide-react";
import {
  getStaffSession,
  loginStaff,
  listReadyStaffSessions,
  redeemStaffSession,
  StaffApiError,
  type StaffBookingItem,
  type StaffAuthSession,
  type StaffSessionDetail,
  type StaffSessionSummary,
} from "@/lib/adminApi";
import {
  canStaffRedeem as staffCanRedeem,
  clearStaffAuthStorage,
  endStaffAuth,
  ensureFreshStaffAuth,
  getStaffIdentityMode,
  getStaffSessionExpiryReason,
  heartbeatStaffAuth,
  isStaffHeartbeatDue,
  markStaffActivity,
  openStaffLogoutChannel,
  readStoredStaffAuth,
  storeStaffAuth,
  type StaffLogoutChannel,
} from "@/lib/staffIdentity";

type LoadState = "idle" | "loading" | "ready" | "error";
type RedeemState = "idle" | "loading" | "success" | "error";
type ScannerState = "idle" | "starting" | "scanning" | "error";

const SWEDISH_SHORT_MONTHS = ["jan", "feb", "mars", "apr", "maj", "juni", "juli", "aug", "sep", "okt", "nov", "dec"];

interface ParsedHandoffPayload {
  checkinSessionId: string | null;
  handoffCode: string | null;
  raw: string;
}

interface RedeemConfirmation {
  bookingReference: string | null;
  completedAt: string | null;
  guestName: string;
  handoffCode: string;
  ticketCount: number;
}

type StaffIconName =
  | "addons-bag"
  | "admission-ticket"
  | "drink-cup"
  | "grip-socks"
  | "group"
  | "info"
  | "jump"
  | "padlock"
  | "payment-card"
  | "profile"
  | "success-check"
  | "time"
  | "visitor-wristband"
  | "water-bottle"
  | "zipline";

function StaffIcon({
  className = "h-8 w-8",
  name,
}: {
  className?: string;
  name: StaffIconName;
}) {
  return (
    <Image
      src={`/jumpyard-next-icons/${name}.png${name === "water-bottle" ? "?v=imagegen-flat-t0186" : ""}`}
      alt=""
      width={48}
      height={48}
      aria-hidden="true"
      className={`origin-center scale-125 object-contain ${className}`}
    />
  );
}

function formatClock(value?: string | null) {
  const match = value?.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return value ?? "-";
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const dateOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (dateOnly) {
    const day = Number(dateOnly[3]);
    const month = Number(dateOnly[2]);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return `${day} ${SWEDISH_SHORT_MONTHS[month - 1]}`;
    }
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return `${parsed.getDate()} ${SWEDISH_SHORT_MONTHS[parsed.getMonth()]}`;
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  const time = new Intl.DateTimeFormat("sv-SE", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
  return `${parsed.getDate()} ${SWEDISH_SHORT_MONTHS[parsed.getMonth()]} ${time}`;
}

function formatMoney(cents?: number | null) {
  if (cents === null || cents === undefined) return "-";

  return new Intl.NumberFormat("sv-SE", {
    currency: "SEK",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(cents / 100);
}

function normalizeProductText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function getItemProductText(item: StaffBookingItem) {
  return normalizeProductText(
    [
      item.parentProductName,
      item.productName,
      item.productId,
      item.parentProductId,
      item.parentType,
      item.productSubType,
      item.productType,
    ].filter(Boolean).join(" ")
  );
}

function getItemDisplayName(item: StaffBookingItem) {
  return item.parentProductName ?? item.productName ?? (item.productId ? `Produkt ${item.productId}` : "Produkt utan namn");
}

function getDurationLabelFromText(value: string) {
  const match = value.match(/\b(60|90|120)\s*min\b/i);
  return match ? `${match[1]} min` : null;
}

function getDurationLabelFromTimes(startTime?: string | null, endTime?: string | null) {
  if (!startTime || !endTime) return null;

  const start = clockToMinutes(startTime);
  const end = clockToMinutes(endTime);
  if (start === null || end === null) return null;

  const duration = end >= start ? end - start : end + 24 * 60 - start;
  return duration > 0 ? `${duration} min` : null;
}

function getItemDurationLabel(item: StaffBookingItem) {
  return (
    (item.durationMinutes && item.durationMinutes > 0 ? `${item.durationMinutes} min` : null) ??
    getDurationLabelFromText(`${item.parentProductName ?? ""} ${item.productName ?? ""}`) ??
    getDurationLabelFromTimes(item.startTime, item.endTime)
  );
}

function clockToMinutes(value: string) {
  const match = value.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;

  return hours * 60 + minutes;
}

function getItemIconName(item: StaffBookingItem): StaffIconName {
  const text = getItemProductText(item);

  if (text.includes("skyrider") || text.includes("sky rider")) return "zipline";
  if (text.includes("strump") || text.includes("sock")) return "grip-socks";
  if (text.includes("vatten") || text.includes("water") || text.includes("flaska") || text.includes("bottle")) return "water-bottle";
  if (text.includes("hanglas") || text.includes("lock")) return "padlock";
  if (text.includes("kaffe") || text.includes("coffee") || text.includes("brygg")) return "drink-cup";
  if (text.includes("familj") || text.includes("family") || text.includes("grupp")) return "group";
  if (text.includes("entre") || text.includes("entry") || text.includes("biljett") || text.includes("ticket") || text.includes("pass")) {
    return "admission-ticket";
  }

  return item.fulfillmentSource === "linked_add_on" ? "addons-bag" : "admission-ticket";
}

type HandoutSectionKey = "checkin" | "later" | "other";

interface HandoutCategoryDefinition {
  icon: StaffIconName;
  key: string;
  label: string;
  note?: string;
  order: number;
  section: HandoutSectionKey;
}

interface HandoutGroup extends HandoutCategoryDefinition {
  hasLinkedAddOn: boolean;
  items: StaffBookingItem[];
  quantity: number;
}

const HANDOUT_SECTIONS: Record<HandoutSectionKey, { note: string; order: number; title: string }> = {
  checkin: {
    note: "Besöksband, strumpor, hänglås och SkyRider-pass.",
    order: 1,
    title: "Lämna ut vid incheckning",
  },
  later: {
    note: "Kaffe och annat som hämtas efter hoppet.",
    order: 2,
    title: "Hämtas efter hoppet",
  },
  other: {
    note: "Kontrollera vid behov innan utlämning.",
    order: 3,
    title: "Kontrollera produkt",
  },
};

function getHandoutCategory(item: StaffBookingItem): HandoutCategoryDefinition {
  const text = getItemProductText(item);
  const structuredProductType = normalizeProductText(
    [item.parentType, item.productSubType, item.productType].filter(Boolean).join(" ")
  );

  if (text.includes("skyrider") || text.includes("sky rider")) {
    return { icon: "zipline", key: "skyrider", label: "SkyRider-pass", order: 40, section: "checkin" };
  }

  if (text.includes("strump") || text.includes("sock")) {
    return { icon: "grip-socks", key: "socks", label: "Strumpor", order: 20, section: "checkin" };
  }

  if (text.includes("vatten") || text.includes("water") || text.includes("flaska") || text.includes("bottle")) {
    return { icon: "water-bottle", key: "water-bottle", label: "Vattenflaska", order: 25, section: "checkin" };
  }

  if (text.includes("hanglas") || text.includes("lock")) {
    return { icon: "padlock", key: "padlock", label: "Hänglås", order: 30, section: "checkin" };
  }

  if (text.includes("kaffe") || text.includes("coffee") || text.includes("brygg")) {
    return {
      icon: "drink-cup",
      key: "coffee",
      label: "Kaffe",
      note: "Hämtas efter hoppet.",
      order: 10,
      section: "later",
    };
  }

  if (
    text.includes("entre") ||
    text.includes("entry") ||
    text.includes("biljett") ||
    text.includes("ticket") ||
    text.includes("pass") ||
    text.includes("familj") ||
    text.includes("family") ||
    text.includes("grupp") ||
    text.includes("barn") ||
    text.includes("jump") ||
    ["admission", "combo", "entry", "family", "jump", "pass", "ticket"].some((type) =>
      structuredProductType.includes(type)
    )
  ) {
    const durationLabel = getItemDurationLabel(item);
    return {
      icon: "visitor-wristband",
      key: durationLabel ? `wristband-${durationLabel.replace(/\s+/g, "-").toLowerCase()}` : "wristband",
      label: durationLabel ? `Besöksband ${durationLabel}` : "Besöksband",
      note: getItemDisplayName(item),
      order: 10,
      section: "checkin",
    };
  }

  return {
    icon: getItemIconName(item),
    key: `product-${item.productId ?? item.bookingItemKey ?? "unknown"}`,
    label: getItemDisplayName(item),
    order: 90,
    section: "other",
  };
}

function getDisplayCode(session: StaffSessionSummary) {
  return session.handoffCode ?? session.bookingReference ?? session.checkinSessionId;
}

function getGuestDisplayName(session: StaffSessionSummary) {
  return session.guest?.name ?? session.guest?.emailMasked ?? session.guest?.phoneMasked ?? "Gäst";
}

function searchableText(session: StaffSessionSummary) {
  return [
    session.handoffCode,
    session.bookingReference,
    session.checkinSessionId,
    session.rollerUniqueId,
    session.visitDate,
    session.guest?.name,
    session.guest?.emailMasked,
    session.guest?.phoneMasked,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function parseHandoffPayload(value: string): ParsedHandoffPayload | null {
  const raw = value.trim();
  if (!raw) return null;

  const handoffMatch = raw.match(/^JY_HANDOFF:([^:]*):([^:\s]+)$/i);
  if (handoffMatch) {
    return {
      checkinSessionId: handoffMatch[2] || null,
      handoffCode: handoffMatch[1] || null,
      raw,
    };
  }

  const sessionMatch = raw.match(/^JY_SESSION:([^:\s]+)$/i);
  if (sessionMatch) {
    return {
      checkinSessionId: sessionMatch[1],
      handoffCode: null,
      raw,
    };
  }

  if (/^jycs_[a-z0-9_/-]+$/i.test(raw)) {
    return {
      checkinSessionId: raw,
      handoffCode: null,
      raw,
    };
  }

  if (/^JY[0-9]{4,}$/i.test(raw)) {
    return {
      checkinSessionId: null,
      handoffCode: raw.toUpperCase(),
      raw,
    };
  }

  return null;
}

function statusLabel(value?: string | null) {
  if (!value) return "-";

  const labels: Record<string, string> = {
    completed: "Klar",
    fresh: "Fresh",
    not_started: "Inte startad",
    paid: "Betald",
    ready_for_staff: "Redo",
    redeemed: "Incheckad",
    requires_staff: "Kräver hjälp",
    unredeemed: "Ej incheckad",
  };

  return labels[value] ?? value.replace(/_/g, " ");
}

function bookingSyncLabel(value?: string | null) {
  if (value === "confirmed") return "ROLLER bekräftad";
  if (value === "needs_staff") return "Behöver personal";
  return "Bokning synkas";
}

function bookingSyncClass(value?: string | null) {
  if (value === "confirmed") return "bg-success/10 text-success";
  if (value === "needs_staff") return "bg-danger/10 text-danger";
  return "bg-primary/10 text-primary";
}

function staffRoleLabel(value?: string | null) {
  if (value === "staff_operator") return "Check-in-personal";
  if (value === "staff_reader") return "Läsbehörighet";
  return value ? value.replace(/_/g, " ") : "Personal";
}

function isSameStaffSession(current: StaffAuthSession | null, expected: StaffAuthSession) {
  if (!current) return false;
  if (expected.identityMode === "pin") {
    return (
      current.identityMode === "pin" &&
      current.auth.token === expected.auth.token &&
      current.session?.sessionId === expected.session?.sessionId &&
      current.staff.actorId === expected.staff.actorId
    );
  }
  return current.identityMode === "legacy" && current.auth.token === expected.auth.token;
}

function staffAuthSessionKey(auth: StaffAuthSession | null) {
  return auth ? `${auth.identityMode}:${auth.session?.sessionId ?? auth.auth.token}` : null;
}

function queueRequestKey(auth: StaffAuthSession, queryVersion: number) {
  return `${staffAuthSessionKey(auth)}:${queryVersion}`;
}

function SessionRow({
  isSelected,
  onSelect,
  session,
}: {
  isSelected: boolean;
  onSelect: () => void;
  session: StaffSessionSummary;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      data-testid="handoff-session-row"
      data-handoff-code={session.handoffCode ?? ""}
      className={`w-full min-w-0 rounded-2xl border px-3 py-3 text-left shadow-sm transition active:scale-[0.99] ${
        isSelected
          ? "border-primary bg-primary/5 ring-4 ring-primary/10"
          : "border-border bg-white hover:border-primary/40 hover:bg-surface"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface">
            <StaffIcon name="visitor-wristband" className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-lg font-black italic uppercase leading-none text-foreground">{getGuestDisplayName(session)}</p>
            <p className="mt-1 truncate text-xs text-foreground">
              {getDisplayCode(session)} · bokning {session.bookingReference ?? "-"}
            </p>
          </div>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${
          bookingSyncClass(session.bookingSyncStatus)
        }`}>
          {session.bookingSyncStatus === "confirmed" ? statusLabel(session.handoffStatus) : bookingSyncLabel(session.bookingSyncStatus)}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-[11px] uppercase text-foreground">
        <span className="rounded-xl bg-surface px-2 py-1.5 text-center">{formatDate(session.visitDate)}</span>
        <span className="rounded-xl bg-surface px-2 py-1.5 text-center">{formatClock(session.booking.startTime)}</span>
        <span className="rounded-xl bg-surface px-2 py-1.5 text-center">{session.counts.selectedTickets} biljetter</span>
      </div>
    </button>
  );
}

function InfoTile({
  icon,
  label,
  value,
  valueClassName = "",
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  valueClassName?: string;
}) {
  const valueClasses = [
    "min-w-0 self-center text-sm font-black italic leading-tight text-foreground sm:text-base",
    valueClassName,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="grid min-h-[92px] min-w-0 grid-rows-[auto_1fr_auto] rounded-2xl border border-border bg-white p-3 shadow-sm">
      <div className="flex h-6 items-center text-foreground">{icon}</div>
      <p className={valueClasses}>{value}</p>
      <p className="mt-1 text-[9px] uppercase leading-none tracking-wide text-foreground sm:text-[10px]">{label}</p>
    </div>
  );
}

function formatHandoutItemNames(items: StaffBookingItem[]) {
  const names = Array.from(new Set(items.map(getItemDisplayName))).filter(Boolean);
  if (names.length <= 2) return names.join(", ");
  return `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
}

function groupHandoutItems(items: StaffBookingItem[]) {
  const groups = new Map<string, HandoutGroup>();

  for (const item of items) {
    const category = getHandoutCategory(item);
    const groupKey = `${category.section}:${category.key}`;
    const existing = groups.get(groupKey);
    const quantity = Math.max(0, item.quantity ?? 0);

    if (existing) {
      existing.items.push(item);
      existing.quantity += quantity;
      existing.hasLinkedAddOn = existing.hasLinkedAddOn || item.fulfillmentSource === "linked_add_on";
      continue;
    }

    groups.set(groupKey, {
      ...category,
      hasLinkedAddOn: item.fulfillmentSource === "linked_add_on",
      items: [item],
      quantity,
    });
  }

  return Array.from(groups.values()).sort((left, right) => {
    const sectionOrder = HANDOUT_SECTIONS[left.section].order - HANDOUT_SECTIONS[right.section].order;
    if (sectionOrder !== 0) return sectionOrder;
    return left.order - right.order || left.label.localeCompare(right.label, "sv-SE");
  });
}

function HandoutSection({
  groups,
  section,
}: {
  groups: HandoutGroup[];
  section: HandoutSectionKey;
}) {
  const sectionInfo = HANDOUT_SECTIONS[section];
  const totalQuantity = groups.reduce((sum, group) => sum + group.quantity, 0);

  return (
    <section data-testid={`handout-section-${section}`} className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
      <div className="flex items-start justify-between gap-3 border-b border-border bg-surface px-3 py-2.5">
        <div className="min-w-0">
          <h4 className="text-sm font-black italic uppercase text-foreground">{sectionInfo.title}</h4>
          <p className="mt-0.5 text-xs leading-snug text-foreground">{sectionInfo.note}</p>
        </div>
        <span className="shrink-0 rounded-xl bg-white px-2.5 py-1 text-xs font-black italic text-foreground">
          {totalQuantity} st
        </span>
      </div>

      <div className="divide-y divide-border">
        {groups.map((group) => (
          <div
            key={`${group.section}:${group.key}`}
            data-handout-category={group.key}
            className="grid grid-cols-[auto_1fr_auto] items-center gap-2 px-3 py-2.5"
          >
            <StaffIcon name={group.icon} className="h-6 w-6 shrink-0" />
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <p className="truncate text-sm font-black italic text-foreground">{group.label}</p>
                {group.hasLinkedAddOn ? (
                  <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-black uppercase text-primary">
                    Tillägg
                  </span>
                ) : null}
              </div>
              <p className="mt-0.5 truncate text-xs text-foreground">
                {group.note ?? formatHandoutItemNames(group.items)}
              </p>
            </div>
            <p className="rounded-xl bg-surface px-2.5 py-1 text-sm font-black italic text-foreground">{group.quantity} st</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function ItemRows({ items }: { items: StaffBookingItem[] }) {
  if (items.length === 0) {
    return <p className="rounded-2xl border border-border bg-white px-4 py-3 text-sm text-foreground">Inga produktrader.</p>;
  }

  const groups = groupHandoutItems(items);
  const groupsBySection = groups.reduce<Record<HandoutSectionKey, HandoutGroup[]>>(
    (sections, group) => {
      sections[group.section].push(group);
      return sections;
    },
    { checkin: [], later: [], other: [] }
  );

  return (
    <div className="grid gap-2" data-testid="staff-handout-list">
      {groups.length === 0 ? (
        items.map((item) => {
        const isLinkedAddOn = item.fulfillmentSource === "linked_add_on";

        return (
        <div
          key={`${item.fulfillmentSource ?? "original"}:${item.bookingItemKey ?? item.bookingItemId ?? item.productId ?? item.productName ?? "item"}`}
          className={`grid grid-cols-[1fr_auto] items-center gap-2 border-b px-3 py-2.5 last:border-b-0 ${
            isLinkedAddOn ? "border-primary/15 bg-primary/5" : "border-border"
          }`}
        >
          <div className="flex min-w-0 items-center gap-2">
            <StaffIcon name={getItemIconName(item)} className="h-6 w-6 shrink-0" />
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <p className="truncate text-sm font-black italic text-foreground">{item.parentProductName ?? item.productName ?? "Produkt"}</p>
                {isLinkedAddOn ? (
                  <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-black uppercase text-primary">
                    Tillägg
                  </span>
                ) : null}
              </div>
            </div>
          </div>
          <p className="rounded-xl bg-surface px-2.5 py-1 text-sm font-black italic text-foreground">{item.quantity} st</p>
        </div>
        );
        })
      ) : (
        (["checkin", "later", "other"] as HandoutSectionKey[]).map((section) =>
          groupsBySection[section].length > 0 ? (
            <HandoutSection key={section} section={section} groups={groupsBySection[section]} />
          ) : null
        )
      )}
    </div>
  );
}

function RedeemSuccessPanel({
  confirmation,
  onReturnToQueue,
  onScanNext,
}: {
  confirmation: RedeemConfirmation;
  onReturnToQueue: () => void;
  onScanNext: () => void;
}) {
  return (
    <section
      data-testid="staff-redeem-success"
      className="grid min-h-[420px] place-items-center overflow-hidden rounded-3xl border border-success/30 bg-success/10 p-4 text-center shadow-sm"
    >
      <div className="w-full max-w-sm rounded-3xl border border-success/25 bg-white p-5 shadow-sm">
        <div className="mx-auto grid h-28 w-28 place-items-center rounded-full bg-success/15">
          <CheckCircle2 className="h-16 w-16 text-success" strokeWidth={3} />
        </div>
        <p className="mt-5 text-[11px] font-black uppercase tracking-[0.22em] text-success">Check-in klar</p>
        <h2 className="mt-1 text-3xl font-black italic uppercase leading-none text-foreground">
          {confirmation.guestName}
        </h2>
        <p className="mt-2 text-sm text-foreground">
          {confirmation.handoffCode} · bokning {confirmation.bookingReference ?? "-"}
        </p>

        <div className="mt-5 grid grid-cols-2 gap-2 text-left">
          <div className="rounded-2xl bg-success/10 p-3">
            <p className="text-[10px] uppercase tracking-wide text-foreground">Biljetter</p>
            <p className="mt-1 text-2xl font-black italic text-success">{confirmation.ticketCount}</p>
          </div>
          <div className="rounded-2xl bg-surface p-3">
            <p className="text-[10px] uppercase tracking-wide text-foreground">Status</p>
            <p className="mt-1 text-base font-black italic text-foreground">Incheckad</p>
          </div>
        </div>

        <p className="mt-4 text-xs text-foreground">
          {confirmation.completedAt ? `Klar ${formatDateTime(confirmation.completedAt)}` : "Välj nästa steg."}
        </p>

        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={onReturnToQueue}
            data-testid="staff-redeem-success-return"
            className="flex min-h-12 w-full items-center justify-center rounded-2xl border border-success/35 bg-white px-4 text-sm font-black italic uppercase text-success shadow-sm transition hover:bg-success/10"
          >
            Tillbaka till kön
          </button>
          <button
            type="button"
            onClick={onScanNext}
            data-testid="staff-redeem-success-scan-next"
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-success px-4 text-sm font-black italic uppercase text-white shadow-sm transition hover:brightness-95"
          >
            <ScanLine size={17} />
            Scanna ny QR
          </button>
        </div>
      </div>
    </section>
  );
}

function DetailPanel({
  auth,
  detail,
  loading,
  onClose,
  onRedeem,
  onReturnToQueue,
  onScanNext,
  redeemConfirmation,
  redeemMessage,
  redeemState,
}: {
  auth: StaffAuthSession | null;
  detail: StaffSessionDetail | null;
  loading: boolean;
  onClose?: () => void;
  onRedeem: () => void;
  onReturnToQueue: () => void;
  onScanNext: () => void;
  redeemConfirmation: RedeemConfirmation | null;
  redeemMessage: string;
  redeemState: RedeemState;
}) {
  if (redeemState === "success" && redeemConfirmation) {
    return (
      <RedeemSuccessPanel
        confirmation={redeemConfirmation}
        onReturnToQueue={onReturnToQueue}
        onScanNext={onScanNext}
      />
    );
  }

  if (loading && !detail) {
    return (
      <section className="grid min-h-48 place-items-center rounded-3xl border border-border bg-surface p-6 shadow-sm">
        <div className="flex items-center gap-3 text-sm font-black italic uppercase text-foreground">
          <Loader2 className="animate-spin" size={20} />
          Hämtar handoff
        </div>
      </section>
    );
  }

  if (!detail) {
    return (
      <section className="grid min-h-44 place-items-center rounded-3xl border border-border bg-surface p-6 text-center shadow-sm">
        <div>
          <StaffIcon name="info" className="mx-auto mb-3 h-10 w-10 opacity-70" />
          <p className="text-lg font-black italic uppercase text-foreground">Välj handoff</p>
          <p className="mt-1 text-sm text-foreground">Skanna QR eller tryck på en bokning i kön.</p>
        </div>
      </section>
    );
  }

  const isCompleted = detail.status === "redeemed" || detail.handoffStatus === "completed";
  const hasRedeemPermission = staffCanRedeem(auth);
  const canRedeem =
    !isCompleted &&
    hasRedeemPermission &&
    detail.bookingSyncStatus === "confirmed" &&
    detail.status === "ready_for_staff" &&
    detail.handoffStatus === "ready_for_staff" &&
    detail.safetyStatus === "completed" &&
    Boolean(auth?.auth.token) &&
    redeemState !== "loading";

  return (
    <section
      data-testid="handoff-detail"
      data-handoff-code={detail.handoffCode ?? ""}
      className="overflow-hidden rounded-3xl border border-border bg-surface shadow-sm"
    >
      <div className="border-b border-border bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/10">
              <StaffIcon name="success-check" className="h-8 w-8" />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-2xl font-black italic uppercase leading-none text-foreground sm:text-3xl">
                {getGuestDisplayName(detail)}
              </h2>
              <p className="mt-1 truncate text-sm text-foreground">
                {getDisplayCode(detail)} · bokning {detail.bookingReference ?? "-"}
              </p>
            </div>
          </div>
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              aria-label="Stäng sammanfattning"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-border bg-white text-foreground transition hover:border-primary hover:text-primary"
            >
              <X size={18} />
            </button>
          ) : (
            <span className="shrink-0 rounded-full bg-success/10 px-3 py-1.5 text-xs font-black uppercase text-success">
              {statusLabel(detail.handoffStatus)}
            </span>
          )}
        </div>
      </div>

      <div
        data-testid="handoff-detail-metadata"
        className="grid grid-cols-1 gap-2 p-3 min-[420px]:grid-cols-3"
      >
        <InfoTile
          icon={<CalendarDays size={20} />}
          label="Datum"
          value={formatDate(detail.visitDate)}
          valueClassName="whitespace-nowrap"
        />
        <InfoTile
          icon={<StaffIcon name="time" className="h-7 w-7" />}
          label="Tid"
          value={`${formatClock(detail.booking.startTime)}-${formatClock(detail.booking.endTime)}`}
          valueClassName="whitespace-nowrap"
        />
        <InfoTile
          icon={<StaffIcon name="payment-card" className="h-7 w-7" />}
          label="Betalning"
          value={statusLabel(detail.booking.paymentStatus ?? detail.booking.bookingStatus)}
        />
      </div>

      <div className="px-3 pb-3">
        <section>
          <div className="mb-2 flex items-center gap-2">
            <StaffIcon name="addons-bag" className="h-7 w-7" />
            <h3 className="text-base font-black italic uppercase text-foreground">Att lämna ut</h3>
          </div>
          <ItemRows items={detail.items} />
        </section>
      </div>

      <div
        data-testid="staff-redeem-panel"
        className="border-t border-border bg-white p-4"
      >
        {detail.bookingSyncStatus === "pending" && (
          <div
            data-testid="handoff-sync-pending"
            className="mb-3 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-2 text-xs font-black uppercase text-primary"
          >
            <Loader2 className="shrink-0 animate-spin" size={14} />
            <span>Synkar bokningen…</span>
          </div>
        )}
        {detail.bookingSyncStatus === "needs_staff" && (
          <div className="mb-3 rounded-2xl border border-danger/25 bg-danger/5 px-4 py-3 text-sm font-semibold text-danger">
            ROLLER-bokningen kunde inte bekräftas automatiskt. Starta inte en ny betalning; kontrollera bokningen manuellt.
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2">
              <StaffIcon name="success-check" className="h-7 w-7" />
              <h3 className="text-base font-black italic uppercase text-foreground">Slutför check-in</h3>
            </div>
          </div>

          {isCompleted ? (
            <span className="inline-flex min-h-12 items-center gap-2 rounded-2xl bg-success/10 px-4 text-sm font-black uppercase text-success">
              <CheckCircle2 size={18} />
              Incheckad
            </span>
          ) : (
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[220px]">
              <button
                type="button"
                onClick={onRedeem}
                disabled={!canRedeem}
                data-testid="staff-redeem-button"
                className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-primary px-5 text-sm font-black italic uppercase text-white shadow-sm transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:bg-surface-strong disabled:text-foreground/45"
              >
                {redeemState === "loading" ? <Loader2 className="animate-spin" size={18} /> : <TicketCheck size={18} />}
                Slutför
              </button>
              {!hasRedeemPermission && auth?.identityMode === "pin" && (
                <p className="text-center text-xs font-semibold text-foreground" data-testid="staff-redeem-role-note">
                  Din roll kan läsa handoff men inte slutföra check-in.
                </p>
              )}
            </div>
          )}
        </div>

        {redeemMessage && (
          <p
            className={`mt-3 text-sm font-semibold ${
              redeemState === "error" ? "text-danger" : "text-success"
            }`}
          >
            {redeemMessage}
          </p>
        )}
      </div>

      <p className="border-t border-border bg-white p-3 text-xs text-foreground">
        Redo: {formatDateTime(detail.readyForStaffAt)} · Total: {formatMoney(detail.booking.totalCents)}
      </p>
    </section>
  );
}

export default function Home() {
  const identityMode = getStaffIdentityMode();
  const [auth, setAuth] = useState<StaffAuthSession | null>(null);
  const [authError, setAuthError] = useState("");
  const [authPin, setAuthPin] = useState("");
  const [authState, setAuthState] = useState<LoadState>("loading");
  const [detail, setDetail] = useState<StaffSessionDetail | null>(null);
  const [detailState, setDetailState] = useState<LoadState>("idle");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [redeemConfirmation, setRedeemConfirmation] = useState<RedeemConfirmation | null>(null);
  const [redeemMessage, setRedeemMessage] = useState("");
  const [redeemState, setRedeemState] = useState<RedeemState>("idle");
  const [scannerMessage, setScannerMessage] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerState, setScannerState] = useState<ScannerState>("idle");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<StaffSessionSummary[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const authRef = useRef<StaffAuthSession | null>(null);
  const activityWriteAtRef = useRef(0);
  const detailRef = useRef<StaffSessionDetail | null>(null);
  const detailRefreshInFlightRef = useRef(false);
  const detailRefreshPendingRef = useRef(false);
  const heartbeatInFlightRef = useRef(false);
  const lifecycleGenerationRef = useRef(0);
  const logoutChannelRef = useRef<StaffLogoutChannel | null>(null);
  const logoutInProgressRef = useRef(false);
  const queueLastRequestedKeyRef = useRef<string | null>(null);
  const queueQueryRef = useRef("");
  const queueQueryVersionRef = useRef(0);
  const queueRefreshInFlightRef = useRef(false);
  const queueRefreshPendingRef = useRef(false);
  const scannerControlsRef = useRef<IScannerControls | null>(null);
  const scannerHandledRef = useRef(false);
  const scannerVideoRef = useRef<HTMLVideoElement | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  const authSessionKey = staffAuthSessionKey(auth);

  const setCurrentAuth = useCallback((nextAuth: StaffAuthSession | null) => {
    authRef.current = nextAuth;
    setAuth(nextAuth);
  }, []);

  const setCurrentDetail = useCallback((nextDetail: StaffSessionDetail | null) => {
    detailRef.current = nextDetail;
    setDetail(nextDetail);
  }, []);

  const setCurrentQuery = useCallback((nextQuery: string) => {
    if (nextQuery !== queueQueryRef.current) {
      queueQueryRef.current = nextQuery;
      queueQueryVersionRef.current += 1;
    }
    setQuery(nextQuery);
  }, []);

  const setCurrentSelectedId = useCallback((nextSelectedId: string | null) => {
    selectedIdRef.current = nextSelectedId;
    setSelectedId(nextSelectedId);
  }, []);

  const clearSensitiveUi = useCallback(() => {
    lifecycleGenerationRef.current += 1;
    scannerControlsRef.current?.stop();
    scannerControlsRef.current = null;
    setCurrentAuth(null);
    setAuthError("");
    setAuthPin("");
    setAuthState("idle");
    setCurrentDetail(null);
    setDetailState("idle");
    setError("");
    setCurrentQuery("");
    setRedeemConfirmation(null);
    setRedeemMessage("");
    setRedeemState("idle");
    setScannerMessage("");
    setScannerOpen(false);
    setScannerState("idle");
    setCurrentSelectedId(null);
    setSessions([]);
    setState("idle");
  }, [setCurrentAuth, setCurrentDetail, setCurrentQuery, setCurrentSelectedId]);

  const terminateStaffSession = useCallback(async () => {
    if (logoutInProgressRef.current) return;
    logoutInProgressRef.current = true;
    const currentAuth = authRef.current;

    logoutChannelRef.current?.broadcast();
    clearStaffAuthStorage();
    clearSensitiveUi();
    try {
      await endStaffAuth(currentAuth);
    } finally {
      logoutInProgressRef.current = false;
    }
  }, [clearSensitiveUi]);

  const getUsableAuth = useCallback(async () => {
    const currentAuth = authRef.current;
    if (!currentAuth) {
      throw new Error("Staff session has ended.");
    }
    if (getStaffSessionExpiryReason(currentAuth)) {
      await terminateStaffSession();
      throw new Error("Personalsessionen har gått ut.");
    }

    try {
      const freshAuth = await ensureFreshStaffAuth(currentAuth);
      if (freshAuth !== currentAuth) setCurrentAuth(freshAuth);
      return freshAuth;
    } catch (refreshError) {
      if (isSameStaffSession(authRef.current, currentAuth)) await terminateStaffSession();
      throw refreshError;
    }
  }, [setCurrentAuth, terminateStaffSession]);

  const handleProtectedAuthFailure = useCallback(
    (requestError: unknown) => {
      if (requestError instanceof StaffApiError && requestError.isAuthenticationFailure) {
        void terminateStaffSession();
        return true;
      }
      return false;
    },
    [terminateStaffSession],
  );

  const selectSession = useCallback((checkinSessionId: string) => {
    setError("");
    setRedeemConfirmation(null);
    setRedeemMessage("");
    setRedeemState("idle");
    setCurrentSelectedId(checkinSessionId);
    setCurrentDetail(null);
    setDetailState("loading");
  }, [setCurrentDetail, setCurrentSelectedId]);

  const closeSelectedSession = useCallback(() => {
    setCurrentDetail(null);
    setDetailState("idle");
    setRedeemConfirmation(null);
    setRedeemMessage("");
    setRedeemState("idle");
    setCurrentSelectedId(null);
  }, [setCurrentDetail, setCurrentSelectedId]);

  const returnToQueueAfterRedeem = useCallback(() => {
    setCurrentDetail(null);
    setDetailState("idle");
    setCurrentQuery("");
    setRedeemConfirmation(null);
    setRedeemMessage("");
    setRedeemState("idle");
    setScannerMessage("");
    setCurrentSelectedId(null);
  }, [setCurrentDetail, setCurrentQuery, setCurrentSelectedId]);

  const scanNextAfterRedeem = useCallback(() => {
    returnToQueueAfterRedeem();
    setScannerMessage("");
    setScannerState("starting");
    setScannerOpen(true);
  }, [returnToQueueAfterRedeem]);

  const refreshSessions = useCallback(async ({ showLoading = true }: { showLoading?: boolean } = {}) => {
    const requestedAuth = authRef.current;
    if (requestedAuth) {
      queueLastRequestedKeyRef.current = queueRequestKey(requestedAuth, queueQueryVersionRef.current);
    }
    if (queueRefreshInFlightRef.current) {
      queueRefreshPendingRef.current = true;
      return;
    }

    queueRefreshInFlightRef.current = true;
    try {
      do {
        queueRefreshPendingRef.current = false;
        let activeAuth: StaffAuthSession;
        try {
          activeAuth = await getUsableAuth();
        } catch {
          return;
        }

        const requestedQuery = queueQueryRef.current;
        const requestedQueryVersion = queueQueryVersionRef.current;
        queueLastRequestedKeyRef.current = queueRequestKey(activeAuth, requestedQueryVersion);
        if (showLoading) setState("loading");
        setError("");

        try {
          const nextSessions = await listReadyStaffSessions(activeAuth.auth.token, requestedQuery);
          if (!isSameStaffSession(authRef.current, activeAuth)) {
            if (authRef.current) queueRefreshPendingRef.current = true;
            continue;
          }
          if (
            requestedQueryVersion !== queueQueryVersionRef.current ||
            requestedQuery !== queueQueryRef.current
          ) {
            continue;
          }

          const currentSelectedId = selectedIdRef.current;
          const nextSelectedId =
            currentSelectedId && nextSessions.some((session) => session.checkinSessionId === currentSelectedId)
              ? currentSelectedId
              : null;

          setSessions(nextSessions);
          setCurrentSelectedId(nextSelectedId);
          if (!nextSelectedId) {
            setDetailState("idle");
            setCurrentDetail(null);
          }
          setState("ready");
        } catch (loadError) {
          if (!isSameStaffSession(authRef.current, activeAuth)) {
            if (authRef.current) queueRefreshPendingRef.current = true;
            continue;
          }
          if (
            requestedQueryVersion !== queueQueryVersionRef.current ||
            requestedQuery !== queueQueryRef.current ||
            queueRefreshPendingRef.current
          ) {
            continue;
          }
          if (handleProtectedAuthFailure(loadError)) return;
          setError(loadError instanceof Error ? loadError.message : "Kunde inte hämta handovers.");
          setState("error");
        }
      } while (queueRefreshPendingRef.current);
    } finally {
      queueRefreshInFlightRef.current = false;
    }
  }, [getUsableAuth, handleProtectedAuthFailure, setCurrentDetail, setCurrentSelectedId]);

  const refreshSelectedDetail = useCallback(async ({ showLoading = false }: { showLoading?: boolean } = {}) => {
    if (!selectedIdRef.current || !authRef.current) return;
    if (detailRefreshInFlightRef.current) {
      detailRefreshPendingRef.current = true;
      return;
    }

    detailRefreshInFlightRef.current = true;
    try {
      do {
        detailRefreshPendingRef.current = false;
        const requestedSelectedId: string | null = selectedIdRef.current;
        if (!requestedSelectedId || !authRef.current) return;
        if (showLoading && !detailRef.current) setDetailState("loading");

        let requestAuth: StaffAuthSession | null = null;
        try {
          requestAuth = await getUsableAuth();
          const nextDetail = await getStaffSession(requestedSelectedId, requestAuth.auth.token);
          if (
            requestedSelectedId !== selectedIdRef.current ||
            !isSameStaffSession(authRef.current, requestAuth)
          ) {
            continue;
          }

          const previousDetail = detailRef.current;
          setCurrentDetail(nextDetail);
          setDetailState("ready");
          if (
            previousDetail?.checkinSessionId === nextDetail.checkinSessionId &&
            previousDetail.bookingSyncStatus === "pending" &&
            nextDetail.bookingSyncStatus !== "pending"
          ) {
            void refreshSessions({ showLoading: false });
          }
        } catch (detailError) {
          if (
            requestedSelectedId !== selectedIdRef.current ||
            (requestAuth && !isSameStaffSession(authRef.current, requestAuth))
          ) {
            continue;
          }
          if (handleProtectedAuthFailure(detailError)) return;
          if (!detailRef.current) {
            setCurrentDetail(null);
            setDetailState("error");
            setError(detailError instanceof Error ? detailError.message : "Kunde inte hämta handoff-detaljen.");
          }
        }
      } while (detailRefreshPendingRef.current);
    } finally {
      detailRefreshInFlightRef.current = false;
    }
  }, [getUsableAuth, handleProtectedAuthFailure, refreshSessions, setCurrentDetail]);

  const openHandoffPayload = useCallback(
    (value: string) => {
      const parsed = parseHandoffPayload(value);
      if (!parsed) {
        setError("Koden känns inte igen. Skanna QR-koden eller klistra in hela handoff-koden.");
        return;
      }

      setScannerMessage("");

      if (parsed.checkinSessionId) {
        setCurrentQuery(parsed.handoffCode ?? parsed.checkinSessionId);
        selectSession(parsed.checkinSessionId);
        return;
      }

      const handoffCode = parsed.handoffCode?.toLowerCase();
      const matchingSession = handoffCode
        ? sessions.find((session) => session.handoffCode?.toLowerCase() === handoffCode)
        : null;

      if (matchingSession) {
        setCurrentQuery(parsed.handoffCode ?? matchingSession.handoffCode ?? "");
        selectSession(matchingSession.checkinSessionId);
        return;
      }

      setCurrentQuery(parsed.handoffCode ?? parsed.raw);
      setError("Handoff-koden finns inte i väntelistan. Tryck Uppdatera eller klistra in hela QR-payloaden.");
    },
    [selectSession, sessions, setCurrentQuery]
  );

  const handleSearchSubmit = useCallback(() => {
    if (parseHandoffPayload(query)) {
      openHandoffPayload(query);
      return;
    }

    void refreshSessions();
  }, [openHandoffPayload, query, refreshSessions]);

  useEffect(() => {
    const channel = openStaffLogoutChannel(() => {
      const remoteAuth = authRef.current ?? readStoredStaffAuth();
      clearStaffAuthStorage();
      clearSensitiveUi();
      void endStaffAuth(remoteAuth, { clearStorage: false, managedLogout: false });
    });
    logoutChannelRef.current = channel;

    return () => {
      if (logoutChannelRef.current === channel) logoutChannelRef.current = null;
      channel.close();
    };
  }, [clearSensitiveUi]);

  useEffect(() => {
    let cancelled = false;
    const lifecycleGeneration = lifecycleGenerationRef.current;
    const timeoutId = window.setTimeout(() => {
      if (lifecycleGeneration !== lifecycleGenerationRef.current) return;
      const storedAuth = readStoredStaffAuth();
      if (!storedAuth) {
        setAuthState("idle");
        setState("idle");
        return;
      }

      if (getStaffSessionExpiryReason(storedAuth)) {
        clearStaffAuthStorage();
        setAuthState("idle");
        setState("idle");
        void endStaffAuth(storedAuth);
        return;
      }

      void (storedAuth.identityMode === "pin" ? heartbeatStaffAuth(storedAuth) : Promise.resolve(storedAuth))
        .then((activeAuth) => {
          if (cancelled || lifecycleGeneration !== lifecycleGenerationRef.current) return;
          if (!isSameStaffSession(readStoredStaffAuth(), storedAuth)) return;
          setCurrentAuth(activeAuth);
          setAuthState("ready");
        })
        .catch(() => {
          if (cancelled || lifecycleGeneration !== lifecycleGenerationRef.current) return;
          if (!isSameStaffSession(readStoredStaffAuth(), storedAuth)) return;
          clearStaffAuthStorage();
          clearSensitiveUi();
          void endStaffAuth(storedAuth);
        });
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [clearSensitiveUi, setCurrentAuth]);

  useEffect(() => {
    if (!authSessionKey) return;
    const scheduledRequestKey = `${authSessionKey}:${queueQueryVersionRef.current}`;
    const timeoutId = window.setTimeout(() => {
      if (queueLastRequestedKeyRef.current === scheduledRequestKey) return;
      void refreshSessions();
    }, query.trim() ? 250 : 0);
    return () => window.clearTimeout(timeoutId);
  }, [authSessionKey, query, refreshSessions]);

  useEffect(() => {
    const activeAuth = authRef.current;
    if (!authSessionKey || !activeAuth || activeAuth.identityMode !== "pin") return;

    activityWriteAtRef.current = 0;
    const recordActivity = () => {
      const currentAuth = authRef.current;
      const now = Date.now();
      if (!currentAuth || currentAuth.identityMode !== "pin") return;
      if (getStaffSessionExpiryReason(currentAuth, now)) {
        void terminateStaffSession();
        return;
      }
      if (now - activityWriteAtRef.current < 15_000) return;

      activityWriteAtRef.current = now;
      const updatedAuth = markStaffActivity(currentAuth, new Date(now));
      if (updatedAuth !== currentAuth) setCurrentAuth(updatedAuth);
    };

    const checkSession = () => {
      const currentAuth = authRef.current;
      if (!currentAuth || currentAuth.identityMode !== "pin") return;
      if (getStaffSessionExpiryReason(currentAuth)) {
        void terminateStaffSession();
        return;
      }
      if (!isStaffHeartbeatDue(currentAuth) || heartbeatInFlightRef.current) return;

      heartbeatInFlightRef.current = true;
      void heartbeatStaffAuth(currentAuth)
        .then((activeAuth) => {
          if (isSameStaffSession(authRef.current, activeAuth)) setCurrentAuth(activeAuth);
        })
        .catch(() => {
          if (isSameStaffSession(authRef.current, currentAuth)) void terminateStaffSession();
        })
        .finally(() => {
          heartbeatInFlightRef.current = false;
        });
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        recordActivity();
        checkSession();
      }
    };

    const activityEvents: Array<keyof WindowEventMap> = ["keydown", "pointerdown", "scroll", "touchstart"];
    for (const eventName of activityEvents) window.addEventListener(eventName, recordActivity, { passive: true });
    document.addEventListener("visibilitychange", handleVisibility);
    const intervalId = window.setInterval(checkSession, 30_000);

    return () => {
      for (const eventName of activityEvents) window.removeEventListener(eventName, recordActivity);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.clearInterval(intervalId);
    };
  }, [authSessionKey, setCurrentAuth, terminateStaffSession]);

  useEffect(() => {
    if (!scannerOpen) return;

    let cancelled = false;
    const lifecycleGeneration = lifecycleGenerationRef.current;
    scannerHandledRef.current = false;

    async function startScanner() {
      try {
        if (!scannerVideoRef.current) {
          throw new Error("Scanner video saknas.");
        }

        const { BrowserQRCodeReader } = await import("@zxing/browser");
        const codeReader = new BrowserQRCodeReader();
        const controls = await codeReader.decodeFromVideoDevice(
          undefined,
          scannerVideoRef.current,
          (result, _error, controls) => {
            if (lifecycleGeneration !== lifecycleGenerationRef.current) {
              controls.stop();
              return;
            }
            const text = result?.getText();
            if (!text || scannerHandledRef.current) return;

            scannerHandledRef.current = true;
            controls.stop();
            scannerControlsRef.current = null;
            setScannerOpen(false);
            setScannerState("idle");
            openHandoffPayload(text);
          }
        );

        if (cancelled || lifecycleGeneration !== lifecycleGenerationRef.current) {
          controls.stop();
          return;
        }

        scannerControlsRef.current = controls;
        setScannerState("scanning");
      } catch (scanError) {
        if (cancelled || lifecycleGeneration !== lifecycleGenerationRef.current) return;
        scannerControlsRef.current = null;
        setScannerState("error");
        setScannerMessage(
          scanError instanceof Error
            ? `Kameran kunde inte startas: ${scanError.message}`
            : "Kameran kunde inte startas."
        );
      }
    }

    void startScanner();

    return () => {
      cancelled = true;
      scannerControlsRef.current?.stop();
      scannerControlsRef.current = null;
    };
  }, [openHandoffPayload, scannerOpen]);

  useEffect(() => {
    if (!selectedId || !authSessionKey) return;
    void refreshSelectedDetail({ showLoading: true });
  }, [authSessionKey, refreshSelectedDetail, selectedId]);

  useEffect(() => {
    if (!selectedId || !authSessionKey || detail?.bookingSyncStatus !== "pending") return;

    let stopped = false;
    let timeoutId: number | null = null;
    const clearScheduledRefresh = () => {
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      timeoutId = null;
    };
    const scheduleRefresh = () => {
      clearScheduledRefresh();
      if (stopped || document.visibilityState !== "visible") return;
      timeoutId = window.setTimeout(() => {
        void refreshSelectedDetail().finally(scheduleRefresh);
      }, 5_000);
    };
    const handleVisibility = () => {
      clearScheduledRefresh();
      if (document.visibilityState !== "visible") return;
      void refreshSelectedDetail().finally(scheduleRefresh);
    };

    document.addEventListener("visibilitychange", handleVisibility);
    scheduleRefresh();
    return () => {
      stopped = true;
      clearScheduledRefresh();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [authSessionKey, detail?.bookingSyncStatus, refreshSelectedDetail, selectedId]);

  useEffect(() => {
    if (!authSessionKey) return;

    let stopped = false;
    let timeoutId: number | null = null;
    const clearScheduledRefresh = () => {
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      timeoutId = null;
    };
    const scheduleRefresh = () => {
      clearScheduledRefresh();
      if (stopped || document.visibilityState !== "visible") return;
      timeoutId = window.setTimeout(() => {
        void refreshSessions({ showLoading: false }).finally(scheduleRefresh);
      }, 5_000);
    };
    const handleVisibility = () => {
      clearScheduledRefresh();
      if (document.visibilityState !== "visible") return;
      void refreshSessions({ showLoading: false }).finally(scheduleRefresh);
    };

    document.addEventListener("visibilitychange", handleVisibility);
    scheduleRefresh();
    return () => {
      stopped = true;
      clearScheduledRefresh();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [authSessionKey, refreshSessions]);

  const handleRedeem = useCallback(
    async () => {
      if (!detail || !auth || getStaffSessionExpiryReason(auth)) {
        setRedeemMessage("Logga in igen för att slutföra check-in.");
        setRedeemState("error");
        void terminateStaffSession();
        return;
      }

      if (!staffCanRedeem(auth)) {
        setRedeemMessage("Din personalroll saknar behörighet att slutföra check-in.");
        setRedeemState("error");
        return;
      }

      setError("");
      setRedeemConfirmation(null);
      setRedeemMessage("");
      setRedeemState("loading");

      try {
        const activeAuth = await getUsableAuth();
        const result = await redeemStaffSession({
          checkinSessionId: detail.checkinSessionId,
          staffToken: activeAuth.auth.token,
          idempotencyKey: `staff-redeem:${detail.checkinSessionId}:${crypto.randomUUID()}`,
        });
        if (!isSameStaffSession(authRef.current, activeAuth)) return;
        const redeemedIds = new Set(result.redeemedTicketIds);

        setDetail((current) => {
          if (!current || current.checkinSessionId !== detail.checkinSessionId) return current;

          return {
            ...current,
            completedAt: result.session.completedAt ?? current.completedAt,
            handoffStatus: result.session.handoffStatus ?? "completed",
            status: result.session.status ?? "redeemed",
            tickets: current.tickets.map((ticket) =>
              ticket.ticketId && redeemedIds.has(ticket.ticketId)
                ? { ...ticket, redeemStatusLastSeen: "redeemed" }
                : ticket
            ),
          };
        });
        setSessions((current) => current.filter((session) => session.checkinSessionId !== detail.checkinSessionId));
        setRedeemConfirmation({
          bookingReference: detail.bookingReference,
          completedAt: result.session.completedAt ?? null,
          guestName: getGuestDisplayName(detail),
          handoffCode: getDisplayCode(detail),
          ticketCount: result.redeemedTicketIds.length,
        });
        setRedeemMessage(`Incheckad: ${result.redeemedTicketIds.length} biljetter.`);
        setRedeemState("success");
      } catch (redeemError) {
        if (!isSameStaffSession(authRef.current, auth)) return;
        if (handleProtectedAuthFailure(redeemError)) return;
        setRedeemMessage(
          redeemError instanceof Error ? redeemError.message : "Kunde inte slutföra incheckningen."
        );
        setRedeemState("error");
      }
    },
    [auth, detail, getUsableAuth, handleProtectedAuthFailure, terminateStaffSession]
  );

  const handleStaffLogin = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      const credential = authPin.trim();
      if (identityMode === "pin" && !/^\d{6}$/.test(credential)) {
        setAuthError("Ange din sexsiffriga PIN-kod.");
        return;
      }
      if (!credential) {
        setAuthError("Ange kod.");
        return;
      }

      setAuthError("");
      setAuthState("loading");
      const lifecycleGeneration = lifecycleGenerationRef.current;

      try {
        const nextAuth = await loginStaff(credential, identityMode);
        if (lifecycleGeneration !== lifecycleGenerationRef.current) return;
        storeStaffAuth(nextAuth);
        setCurrentAuth(nextAuth);
        setAuthPin("");
        setAuthState("ready");
        setState("loading");
      } catch (loginError) {
        if (lifecycleGeneration !== lifecycleGenerationRef.current) return;
        setAuthPin("");
        setAuthError(loginError instanceof Error ? loginError.message : "Kunde inte logga in.");
        setAuthState("error");
      }
    },
    [authPin, identityMode, setCurrentAuth]
  );

  const handleStaffLogout = useCallback(() => {
    void terminateStaffSession();
  }, [terminateStaffSession]);

  const filteredSessions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return sessions;
    if (normalized.includes("@")) return sessions;
    return sessions.filter((session) => searchableText(session).includes(normalized));
  }, [query, sessions]);

  const hasError = state === "error" || detailState === "error";

  if (!auth) {
    return (
      <main className="grid min-h-screen min-w-0 place-items-center bg-background px-3 py-4 text-foreground sm:px-4 sm:py-8">
        <section className="w-full min-w-0 max-w-md rounded-3xl border border-border bg-surface p-3 shadow-sm sm:p-4">
          <div className="min-w-0 rounded-2xl border border-border bg-white p-4 sm:p-5">
            <div className="flex items-center gap-3">
              <Image
                src="/jumpyard_logo.png"
                alt="JumpYard"
                width={44}
                height={44}
                priority
                className="h-11 w-11 object-contain"
              />
              <h1 className="text-2xl font-black italic uppercase text-foreground">Handoff</h1>
            </div>

            <p className="mt-4 text-sm leading-relaxed text-foreground">
              {identityMode === "pin" ? "Ange din PIN-kod." : "Ange kod för att öppna handoff-kön."}
            </p>

            <form className="mt-6 grid min-w-0 gap-4" onSubmit={handleStaffLogin} data-testid="staff-auth-login">
              <label className="grid min-w-0 gap-2">
                <span className="text-[10px] font-black italic uppercase tracking-[0.22em] text-foreground">
                  {identityMode === "pin" ? "PIN-kod" : "Kod"}
                </span>
                <span className="flex min-h-13 w-full min-w-0 items-center rounded-2xl border border-border bg-white px-3 focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/10 sm:min-h-14 sm:px-4">
                  <input
                    value={authPin}
                    onChange={(event) => {
                      const value = identityMode === "pin"
                        ? event.target.value.replace(/\D/g, "").slice(0, 6)
                        : event.target.value;
                      setAuthPin(value);
                      if (authError) setAuthError("");
                    }}
                    data-testid={identityMode === "pin" ? "staff-auth-pin" : "staff-auth-passcode"}
                    type="password"
                    inputMode={identityMode === "pin" ? "numeric" : undefined}
                    pattern={identityMode === "pin" ? "[0-9]*" : undefined}
                    maxLength={identityMode === "pin" ? 6 : undefined}
                    autoComplete="off"
                    autoFocus
                    aria-label={identityMode === "pin" ? "Sexsiffrig PIN-kod" : "Kod"}
                    className="h-full w-full min-w-0 flex-1 border-0 bg-transparent text-center text-xl font-black tracking-[0.3em] outline-none sm:text-2xl sm:tracking-[0.45em]"
                  />
                </span>
              </label>

              {authError && (
                <p className="rounded-2xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
                  {authError}
                </p>
              )}

              <button
                type="submit"
                disabled={authState === "loading" || (identityMode === "pin" && authPin.length !== 6)}
                data-testid="staff-auth-submit"
                className="flex min-h-13 min-w-0 items-center justify-center gap-2 rounded-2xl bg-primary px-4 text-base font-black italic uppercase text-white shadow-sm transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:bg-surface-strong disabled:text-foreground/45 sm:min-h-14 sm:text-lg"
              >
                {authState === "loading" && <Loader2 className="animate-spin" size={18} />}
                Logga in
              </button>
            </form>

            {identityMode === "pin" && (
              <p className="mt-4 text-center text-xs font-bold text-foreground">
                Glömt PIN-koden? Be en administratör att återställa den.
              </p>
            )}
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border bg-white/95 px-4 py-2 backdrop-blur sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
            <Image
              src="/jumpyard_logo.png"
              alt="JumpYard"
              width={42}
              height={42}
              priority
              className="h-8 w-8 shrink-0 object-contain sm:h-9 sm:w-9"
            />
            <div className="min-w-0">
              <h1 className="text-xl font-black italic uppercase leading-none text-foreground sm:text-2xl">Handoff</h1>
              <p className="truncate text-xs font-bold text-foreground sm:text-sm" data-testid="staff-personal-identity">
                {auth.identityMode === "pin"
                  ? `${auth.staff.displayName} · ${staffRoleLabel(auth.staff.role)}`
                  : "Redo för check-in"}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                void refreshSessions();
                void refreshSelectedDetail();
              }}
              disabled={state === "loading"}
              aria-label="Uppdatera"
              className="flex h-11 w-11 items-center justify-center rounded-2xl border border-border bg-white text-foreground transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCcw className={state === "loading" ? "animate-spin" : ""} size={18} />
            </button>
            <button
              type="button"
              onClick={handleStaffLogout}
              aria-label="Byt personal"
              className="min-h-11 rounded-2xl px-1 text-xs font-bold italic text-foreground transition hover:text-danger min-[360px]:px-2 min-[360px]:text-sm sm:px-3"
            >
              Byt personal
            </button>
          </div>
        </div>
      </header>

      {(selectedId || (redeemState === "success" && Boolean(redeemConfirmation))) && (
        <div className="mx-auto max-w-3xl px-3 py-3 pb-[calc(1rem+env(safe-area-inset-bottom))] lg:hidden">
          <DetailPanel
            auth={auth}
            key={detail?.checkinSessionId ?? "mobile-focus"}
            detail={detail}
            loading={detailState === "loading"}
            onClose={closeSelectedSession}
            onRedeem={handleRedeem}
            onReturnToQueue={returnToQueueAfterRedeem}
            onScanNext={scanNextAfterRedeem}
            redeemConfirmation={redeemConfirmation}
            redeemMessage={redeemMessage}
            redeemState={redeemState}
          />
        </div>
      )}

      <div className={`mx-auto max-w-7xl gap-4 px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:px-6 lg:grid-cols-[minmax(340px,400px)_1fr] lg:px-8 ${selectedId ? "hidden lg:grid" : "grid"}`}>
        <aside className={`${selectedId ? "hidden lg:block" : ""} order-1 min-w-0 rounded-3xl border border-border bg-white shadow-sm lg:order-1`}>
          <div className="border-b border-border p-4">
            <label className="flex min-h-14 items-center gap-3 rounded-2xl border border-border bg-white px-4 focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/10">
              <Search className="shrink-0 text-foreground" size={18} />
              <input
                value={query}
                onChange={(event) => setCurrentQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") handleSearchSubmit();
                }}
                placeholder="Sök eller skanna QR"
                className="h-full min-w-0 flex-1 border-0 bg-transparent text-sm font-bold outline-none placeholder:text-foreground/35"
                autoComplete="off"
              />
            </label>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleSearchSubmit}
                disabled={!query.trim()}
                data-testid="handoff-open-code"
                className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-border bg-white px-3 text-sm font-black italic uppercase text-foreground transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:bg-surface disabled:text-foreground/40"
              >
                <Search size={16} />
                Sök
              </button>
              <button
                type="button"
                onClick={() => {
                  if (scannerOpen) {
                    setScannerOpen(false);
                    setScannerState("idle");
                    return;
                  }

                  setScannerMessage("");
                  setScannerState("starting");
                  setScannerOpen(true);
                }}
                data-testid="handoff-scan-toggle"
                className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-primary px-3 text-sm font-black italic uppercase text-white shadow-sm transition hover:bg-primary-dark"
              >
                <ScanLine size={17} />
                {scannerOpen ? "Stäng" : "Skanna QR"}
              </button>
            </div>

            {scannerOpen && (
              <div
                data-testid="handoff-qr-scanner"
                className="mt-3 overflow-hidden rounded-2xl border border-border bg-surface"
              >
                <video
                  ref={scannerVideoRef}
                  className="aspect-[4/3] w-full bg-black object-cover sm:aspect-video"
                  muted
                  playsInline
                />
                <div className="flex items-center justify-between gap-3 border-t border-border bg-white px-3 py-2">
                  <p className="text-xs uppercase text-foreground">
                    {scannerState === "starting"
                      ? "Startar kamera"
                      : scannerState === "scanning"
                        ? "Rikta kameran mot QR-koden"
                        : scannerState === "error"
                          ? scannerMessage
                          : "QR-skanner"}
                  </p>
                  {scannerState === "starting" && <Loader2 className="shrink-0 animate-spin text-foreground" size={16} />}
                </div>
              </div>
            )}
          </div>

          {hasError && (
            <div className="border-b border-danger/20 bg-danger/5 px-4 py-3">
              <div className="flex items-start gap-2 text-sm text-danger">
                <AlertTriangle className="mt-0.5 shrink-0" size={18} />
                <span>{error}</span>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <p className="text-sm font-black italic uppercase text-foreground">Kö</p>
              <p className="text-xs text-foreground">Redo för personal</p>
            </div>
            <span className="rounded-full bg-surface px-3 py-1 text-xs text-foreground">{filteredSessions.length}</span>
          </div>

          <div className="grid max-h-none gap-3 overflow-auto p-3 lg:max-h-[calc(100vh-245px)]">
            {state === "loading" && sessions.length === 0 && (
              <div className="flex items-center gap-3 rounded-2xl bg-surface px-4 py-5 text-sm font-black italic uppercase text-foreground">
                <Loader2 className="animate-spin" size={18} />
                Hämtar
              </div>
            )}

            {state !== "loading" && filteredSessions.length === 0 && (
              <div className="rounded-2xl bg-surface px-4 py-8 text-sm text-foreground">Inga handovers väntar.</div>
            )}

            {filteredSessions.map((session) => (
              <SessionRow
                key={session.checkinSessionId}
                isSelected={session.checkinSessionId === selectedId}
                onSelect={() => selectSession(session.checkinSessionId)}
                session={session}
              />
            ))}
          </div>
        </aside>

        <div className="order-2 hidden lg:block">
          <DetailPanel
            auth={auth}
            key={detail?.checkinSessionId ?? "empty"}
            detail={detail}
            loading={detailState === "loading"}
            onRedeem={handleRedeem}
            onReturnToQueue={returnToQueueAfterRedeem}
            onScanNext={scanNextAfterRedeem}
            redeemConfirmation={redeemConfirmation}
            redeemMessage={redeemMessage}
            redeemState={redeemState}
          />
        </div>
      </div>
    </main>
  );
}
