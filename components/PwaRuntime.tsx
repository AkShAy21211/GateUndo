"use client";

import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const VISIT_COUNT_KEY = "railundo_visit_count";
const INSTALL_DISMISSED_KEY = "railundo_install_dismissed";

export default function PwaRuntime() {
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [shouldShowBanner, setShouldShowBanner] = useState(false);

  useEffect(() => {
    let removeControllerChangeListener = () => undefined;

    if ("serviceWorker" in navigator) {
      let hasRefreshedForUpdate = false;
      const hadController = Boolean(navigator.serviceWorker.controller);

      const handleControllerChange = () => {
        if (!hadController || hasRefreshedForUpdate) {
          return;
        }

        hasRefreshedForUpdate = true;
        window.location.reload();
      };

      navigator.serviceWorker.addEventListener(
        "controllerchange",
        handleControllerChange,
      );
      removeControllerChangeListener = () => {
        navigator.serviceWorker.removeEventListener(
          "controllerchange",
          handleControllerChange,
        );
      };

      navigator.serviceWorker
        .register("/sw.js")
        .then((registration) => registration.update())
        .catch(() => undefined);
    }

    const visitCount = Number(localStorage.getItem(VISIT_COUNT_KEY) ?? "0") + 1;
    localStorage.setItem(VISIT_COUNT_KEY, String(visitCount));

    const wasDismissed = localStorage.getItem(INSTALL_DISMISSED_KEY) === "true";
    setShouldShowBanner(visitCount >= 2 && !wasDismissed);

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    return () => {
      removeControllerChangeListener();
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  const dismissBanner = () => {
    localStorage.setItem(INSTALL_DISMISSED_KEY, "true");
    setShouldShowBanner(false);
  };

  const installApp = async () => {
    if (!installPrompt) {
      return;
    }

    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    setInstallPrompt(null);

    if (choice.outcome === "accepted") {
      dismissBanner();
    }
  };

  if (!shouldShowBanner) {
    return null;
  }

  return (
    <div className="fixed inset-x-4 bottom-[calc(16px+env(safe-area-inset-bottom))] z-[80] mx-auto flex max-w-[460px] items-center gap-3 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] p-3 shadow-2xl">
      <p className="min-w-0 flex-1 text-[13px] font-semibold leading-[1.5] text-[var(--text-primary)]">
        Install RailUndo - get gate alerts faster
      </p>
      <button
        type="button"
        onClick={installApp}
        disabled={!installPrompt}
        className="min-h-11 rounded-lg bg-[var(--accent)] px-4 text-[15px] font-semibold leading-[1.2] text-[#0A0A0A] disabled:opacity-50"
      >
        Install
      </button>
      <button
        type="button"
        onClick={dismissBanner}
        className="min-h-11 rounded-lg px-2 text-[13px] font-semibold leading-[1.5] text-[var(--text-secondary)]"
      >
        Dismiss
      </button>
    </div>
  );
}
