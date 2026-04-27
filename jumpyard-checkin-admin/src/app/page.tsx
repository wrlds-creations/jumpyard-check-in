"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { BrowserQRCodeReader, type IScannerControls } from "@zxing/browser";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Clock3,
  Mail,
  QrCode,
  RotateCcw,
  Search,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import {
  lookupCheckin,
  redeemCheckin,
  searchCheckins,
  type AdminCheckin,
  type HandoutItem,
} from "@/lib/adminApi";

type LookupState = "idle" | "loading" | "ready" | "error";

const DEFAULT_MOCK_CODE = "A274";

function scrollToPageTop() {
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
}

function itemTotal(items: HandoutItem[]): number {
  return items.reduce((total, item) => total + item.qty, 0);
}

function HandoutRows({ items }: { items: HandoutItem[] }) {
  return (
    <div className="grid gap-2">
      {items.map((item) => (
        <div key={item.id} className="flex min-h-16 items-center justify-between gap-4 rounded-xl border border-border bg-white px-4 py-3 shadow-sm">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-surface text-primary">
              <CheckCircle2 size={20} />
            </div>
            <div className="min-w-0">
              <p className="truncate text-base font-black italic uppercase text-foreground">{item.label}</p>
              <p className="text-xs font-bold italic uppercase tracking-[0.16em] text-muted">
                {item.kind === "physical" ? "Lämnas ut" : "Tillval"}
              </p>
            </div>
          </div>
          <div className="grid h-12 min-w-14 place-items-center rounded-xl bg-primary px-3 text-2xl font-black italic text-white">
            {item.qty}
          </div>
        </div>
      ))}
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-danger/25 bg-danger/5 p-5">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 shrink-0 text-danger" size={24} />
        <div>
          <h2 className="text-lg font-black italic uppercase text-danger">Koden kunde inte hittas</h2>
          <p className="mt-1 text-sm font-medium text-foreground">{message}</p>
        </div>
      </div>
    </div>
  );
}

function CheckinPanel({
  checkin,
  redeeming,
  onRedeem,
  onReset,
}: {
  checkin: AdminCheckin;
  redeeming: boolean;
  onRedeem: () => void;
  onReset: () => void;
}) {
  const physicalItems = checkin.handoutItems.filter((item) => item.kind === "physical");
  const experienceItems = checkin.handoutItems.filter((item) => item.kind !== "physical");

  return (
    <motion.div
      className="flex flex-col gap-4"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
    >
      <div className="rounded-xl border border-success/30 bg-success/10 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <ShieldCheck className="shrink-0 text-success" size={22} />
            <div>
              <p className="text-[11px] font-black italic uppercase tracking-[0.25em] text-success">
                Klar
              </p>
              <h2 className="text-lg font-black italic uppercase text-foreground">Klar att lämna ut</h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onReset}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-border bg-white text-muted transition hover:text-foreground"
            aria-label="Ny gäst"
          >
            <RotateCcw size={20} />
          </button>
        </div>
      </div>

      <section className="rounded-xl border border-border bg-surface p-4">
        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg bg-white p-3">
            <UserRound className="mb-2 text-muted" size={18} />
            <p className="truncate text-base font-black italic text-foreground">{checkin.guestName}</p>
            <p className="text-xs font-bold italic uppercase tracking-[0.16em] text-muted">Gäst</p>
          </div>
          <div className="rounded-lg bg-white p-3">
            <Mail className="mb-2 text-muted" size={18} />
            <p className="truncate text-sm font-bold text-foreground">{checkin.email}</p>
            <p className="text-xs font-bold italic uppercase tracking-[0.16em] text-muted">Email</p>
          </div>
          <div className="rounded-lg bg-white p-3">
            <Clock3 className="mb-2 text-muted" size={18} />
            <p className="text-base font-black italic text-foreground">{checkin.time}</p>
            <p className="text-xs font-bold italic uppercase tracking-[0.16em] text-muted">Tid</p>
          </div>
          <div className="rounded-lg bg-white p-3">
            <QrCode className="mb-2 text-muted" size={18} />
            <p className="text-base font-black italic tracking-widest text-primary">{checkin.shortCode}</p>
            <p className="text-xs font-bold italic uppercase tracking-[0.16em] text-muted">Kod</p>
          </div>
        </div>

        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black italic uppercase tracking-[0.25em] text-muted">Utlämning</p>
            <h3 className="text-xl font-black italic uppercase text-foreground">Fysiska items</h3>
            <p className="mt-1 text-sm text-muted">Plocka fram och lämna ut detta till gästen.</p>
          </div>
          <div className="rounded-xl border border-border bg-white px-3 py-2 text-center">
            <p className="text-2xl font-black italic text-primary">{itemTotal(physicalItems)}</p>
            <p className="text-[10px] font-black italic uppercase tracking-[0.18em] text-muted">Totalt</p>
          </div>
        </div>

        <HandoutRows items={physicalItems} />

        {experienceItems.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-xs font-black italic uppercase tracking-[0.2em] text-muted">Övriga tillval</p>
            <HandoutRows items={experienceItems} />
          </div>
        )}

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={onRedeem}
            disabled={redeeming}
            className="flex min-h-14 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-base font-black italic uppercase text-white transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
          >
            <CheckCircle2 size={22} />
            {redeeming ? "Markerar..." : "Markera utlämnat"}
          </button>
          <button
            type="button"
            onClick={onReset}
            className="min-h-14 rounded-xl border border-border bg-white px-5 text-base font-black italic uppercase text-foreground transition hover:border-primary hover:text-primary"
          >
            Ny gäst
          </button>
        </div>
      </section>
    </motion.div>
  );
}

export default function Home() {
  const [code, setCode] = useState("");
  const [bookingSearch, setBookingSearch] = useState("");
  const [state, setState] = useState<LookupState>("idle");
  const [error, setError] = useState("");
  const [checkin, setCheckin] = useState<AdminCheckin | null>(null);
  const [redeeming, setRedeeming] = useState(false);
  const [scannerActive, setScannerActive] = useState(false);
  const [scanError, setScanError] = useState("");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scannerControlsRef = useRef<IScannerControls | null>(null);

  const stopScanner = useCallback(() => {
    scannerControlsRef.current?.stop();
    scannerControlsRef.current = null;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setScannerActive(false);
  }, []);

  const showCheckin = useCallback((result: AdminCheckin) => {
    setCheckin(result);
    setCode(result.shortCode);
    setBookingSearch(result.guestName);
    setError("");
    setState("ready");
    window.requestAnimationFrame(scrollToPageTop);
  }, []);

  const handleLookup = useCallback(
    async (rawCode?: string) => {
      const lookupValue = (rawCode ?? code).trim() || DEFAULT_MOCK_CODE;

      scrollToPageTop();
      setState("loading");
      setError("");
      setCheckin(null);

      try {
        const result = await lookupCheckin(lookupValue);
        showCheckin(result);
      } catch (lookupError) {
        setError(lookupError instanceof Error ? lookupError.message : "Koden kunde inte slås upp.");
        setState("error");
      }
    },
    [code, showCheckin]
  );

  const searchResults = searchCheckins(bookingSearch);

  const startScanner = useCallback(async () => {
    setScanError("");

    if (!navigator.mediaDevices?.getUserMedia) {
      setScanError("Kameran kräver HTTPS och en webbläsare med kameraåtkomst. Använd kortkoden om den inte öppnas.");
      return;
    }

    if (!videoRef.current) {
      setScanError("Kamerafönstret är inte redo än. Prova igen.");
      return;
    }

    try {
      stopScanner();
      setScannerActive(true);

      const reader = new BrowserQRCodeReader(undefined, {
        delayBetweenScanAttempts: 250,
        delayBetweenScanSuccess: 500,
      });

      const controls = await reader.decodeFromConstraints(
        {
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        },
        videoRef.current,
        (result, _error, callbackControls) => {
          const rawValue = result?.getText();
          if (!rawValue) return;

          callbackControls.stop();
          scannerControlsRef.current = null;
          setScannerActive(false);
          setCode(rawValue);
          void handleLookup(rawValue);
        }
      );

      scannerControlsRef.current = controls;
    } catch {
      setScannerActive(false);
      setScanError("Kameran kunde inte startas. Öppna länken via HTTPS, tillåt kamera och prova igen.");
    }
  }, [handleLookup, stopScanner]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    stopScanner();
    void handleLookup();
  };

  const handleRedeem = async () => {
    if (!checkin) return;

    setRedeeming(true);
    setError("");

    try {
      await redeemCheckin(checkin.id);
      reset();
    } catch (redeemError) {
      setError(redeemError instanceof Error ? redeemError.message : "Utlämningen kunde inte markeras.");
      setState("error");
    } finally {
      setRedeeming(false);
    }
  };

  const reset = () => {
    stopScanner();
    setCode("");
    setBookingSearch("");
    setState("idle");
    setError("");
    setCheckin(null);
    setRedeeming(false);
    setScanError("");
  };

  useEffect(() => stopScanner, [stopScanner]);

  useEffect(() => {
    if (state === "ready" && checkin) {
      scrollToPageTop();
    }
  }, [state, checkin]);

  return (
    <main className="min-h-screen bg-background px-4 py-4 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
          <div className="flex items-center gap-3">
            <Image
              src="/jumpyard_logo.png"
              alt="JumpYard"
              width={44}
              height={44}
              priority
              className="h-11 w-11 object-contain"
            />
            <div>
              <h1 className="text-2xl font-black italic uppercase text-foreground sm:text-3xl">Utlämning</h1>
            </div>
          </div>
        </header>

        {state === "ready" && checkin ? (
          <section className="mx-auto w-full max-w-2xl">
            <AnimatePresence mode="wait">
              <CheckinPanel
                key={checkin.id + checkin.status}
                checkin={checkin}
                redeeming={redeeming}
                onRedeem={() => void handleRedeem()}
                onReset={reset}
              />
            </AnimatePresence>
          </section>
        ) : (
          <section className="mx-auto flex w-full max-w-xl flex-col gap-5 rounded-xl border border-border bg-surface p-4 sm:p-5">
            <div>
              <div className="mb-3 flex items-center gap-2">
                <Camera className="text-primary" size={22} />
                <h2 className="text-lg font-black italic uppercase text-foreground">Skanna QR</h2>
              </div>

              <div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-border bg-foreground">
                <video ref={videoRef} className="h-full w-full object-cover" muted playsInline autoPlay />
                {!scannerActive && (
                  <div className="absolute inset-0 grid place-items-center px-6 text-center text-sm font-black italic uppercase tracking-[0.2em] text-white/70">
                    Kamera redo
                  </div>
                )}
                {scannerActive && (
                  <div className="pointer-events-none absolute inset-8 rounded-2xl border-2 border-white/80 shadow-[0_0_0_999px_rgba(0,0,0,0.35)]" />
                )}
              </div>

              <button
                type="button"
                onClick={scannerActive ? stopScanner : startScanner}
                className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-black italic uppercase text-white transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Camera size={20} />
                {scannerActive ? "Stoppa kamera" : "Starta kamera"}
              </button>

              {scanError && (
                <p className="mt-3 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm font-bold text-foreground">
                  {scanError}
                </p>
              )}
            </div>

            <div className="h-px bg-border" />

            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Search className="text-primary" size={22} />
                <h2 className="text-lg font-black italic uppercase text-foreground">Kortkod eller QR-payload</h2>
              </div>
              <input
                id="checkin-code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="A274 eller JY:BOOK-A274"
                className="min-h-14 rounded-xl border border-border bg-white px-4 text-lg font-black uppercase tracking-wider outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10"
                autoComplete="off"
                autoCapitalize="characters"
                aria-label="Kortkod eller QR-payload"
              />
              <button
                type="submit"
                disabled={state === "loading"}
                className="flex min-h-14 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-base font-black italic uppercase text-white transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Search size={20} />
                {state === "loading" ? "Söker..." : "Slå upp"}
              </button>
              <p className="text-xs font-semibold text-muted">
                Lämna fältet tomt och tryck Slå upp för att visa en mockbokning.
              </p>
            </form>

            <div className="h-px bg-border" />

            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <UserRound className="text-primary" size={22} />
                <h2 className="text-lg font-black italic uppercase text-foreground">Sök efter bokning</h2>
              </div>
              <input
                value={bookingSearch}
                onChange={(event) => setBookingSearch(event.target.value)}
                placeholder="Namn, efternamn eller email"
                className="min-h-14 rounded-xl border border-border bg-white px-4 text-base font-semibold text-foreground outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10"
                autoComplete="off"
                aria-label="Sök efter bokning"
              />

              <div className="flex flex-col gap-2">
                {bookingSearch.trim().length < 2 && (
                  <p className="rounded-xl border border-border bg-white px-4 py-3 text-sm font-medium text-muted">
                    Testa Lou, Lisa, Klara, Andersson eller en emailadress.
                  </p>
                )}

                {bookingSearch.trim().length >= 2 && searchResults.length === 0 && (
                  <p className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm font-bold text-foreground">
                    Ingen mockbokning matchar sökningen.
                  </p>
                )}

                {searchResults.map((result) => (
                  <button
                    key={result.id}
                    type="button"
                    onClick={() => {
                      stopScanner();
                      showCheckin(result);
                    }}
                    className="rounded-xl border border-border bg-white p-4 text-left transition hover:border-primary hover:ring-4 hover:ring-primary/10"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-base font-black italic uppercase text-foreground">
                          {result.guestName}
                        </p>
                        <p className="truncate text-sm text-muted">{result.email}</p>
                      </div>
                      <span className="rounded-lg bg-surface px-3 py-2 text-sm font-black italic uppercase tracking-[0.18em] text-primary">
                        {result.shortCode}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold italic uppercase tracking-[0.14em] text-muted">
                      <span>{result.time}</span>
                      <span>{result.jumpers} jumpers</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <AnimatePresence mode="wait">
              {state === "loading" && (
                <motion.div
                  key="loading"
                  className="flex items-center gap-3 rounded-xl border border-border bg-white px-4 py-3"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                >
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  <p className="text-sm font-black italic uppercase tracking-[0.2em] text-muted">Slår upp check-in</p>
                </motion.div>
              )}
              {state === "error" && <ErrorState key="error" message={error} />}
            </AnimatePresence>
          </section>
        )}
      </div>
    </main>
  );
}
