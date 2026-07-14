"use client";

import Image from "next/image";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  clearAdminAuthStorage,
  completeAdminSignIn,
  endAdminAuth,
  openAdminLogoutChannel,
  readStoredAdminAuth,
  startAdminSignIn,
} from "@/lib/adminIdentity";

export default function AdminAuthCallbackPage() {
  const logoutGenerationRef = useRef(0);
  const startedRef = useRef(false);
  const [error, setError] = useState("");
  const [restarting, setRestarting] = useState(false);

  useEffect(() => {
    const channel = openAdminLogoutChannel(() => {
      const remoteAuth = readStoredAdminAuth();
      logoutGenerationRef.current += 1;
      clearAdminAuthStorage();
      setRestarting(false);
      setError("Administratörssessionen avslutades i en annan flik.");
      void endAdminAuth(remoteAuth, { clearStorage: false, managedLogout: false });
    });
    return () => channel.close();
  }, []);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    const logoutGeneration = logoutGenerationRef.current;

    void completeAdminSignIn()
      .then(() => {
        if (logoutGeneration !== logoutGenerationRef.current) {
          clearAdminAuthStorage();
          return;
        }
        window.location.replace("/admin");
      })
      .catch((callbackError) => {
        if (logoutGeneration !== logoutGenerationRef.current) return;
        clearAdminAuthStorage();
        setError(
          callbackError instanceof Error
            ? callbackError.message
            : "Inloggningen kunde inte slutföras. Försök igen.",
        );
      });
  }, []);

  const restart = useCallback(async () => {
    setError("");
    setRestarting(true);
    const logoutGeneration = logoutGenerationRef.current;
    try {
      await startAdminSignIn();
    } catch (restartError) {
      if (logoutGeneration !== logoutGenerationRef.current) return;
      setError(
        restartError instanceof Error
          ? restartError.message
          : "Inloggningen kunde inte startas. Försök igen.",
      );
      setRestarting(false);
    }
  }, []);

  return (
    <main className="grid min-h-screen min-w-0 place-items-center bg-background px-3 py-4 text-foreground sm:px-4 sm:py-8">
      <section className="w-full min-w-0 max-w-md rounded-3xl border border-border bg-surface p-3 shadow-sm sm:p-4">
        <div className="min-w-0 rounded-2xl border border-border bg-white p-4 sm:p-5">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <Image
              src="/jumpyard_logo.png"
              alt="JumpYard"
              width={44}
              height={44}
              priority
              className="h-11 w-11 shrink-0 object-contain"
            />
            <h1 className="min-w-0 text-xl font-black italic uppercase text-foreground sm:text-2xl">Admininloggning</h1>
          </div>

          {!error ? (
            <div className="mt-6 flex min-w-0 items-center gap-3 rounded-2xl bg-surface px-3 py-5 text-sm font-black italic uppercase text-foreground sm:px-4">
              <Loader2 className="animate-spin" size={20} />
              Verifierar administratör
            </div>
          ) : (
            <div className="mt-6 grid gap-4">
              <div className="flex items-start gap-3 rounded-2xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
                <AlertTriangle className="mt-0.5 shrink-0" size={18} />
                <p>{error}</p>
              </div>
              <button
                type="button"
                onClick={() => void restart()}
                disabled={restarting}
                className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-primary px-4 text-lg font-black italic uppercase text-white shadow-sm transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:bg-surface-strong disabled:text-foreground/45"
              >
                {restarting && <Loader2 className="animate-spin" size={18} />}
                Logga in igen
              </button>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
