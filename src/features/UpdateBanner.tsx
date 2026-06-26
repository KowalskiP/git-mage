import { useEffect, useState } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { useT } from "../i18n/useT";

/**
 * Auto-update prompt (SPEC §M7). On startup it checks the configured GitHub
 * Releases endpoint; if a newer signed release exists it offers to download,
 * install and relaunch. Silently no-ops when the endpoint isn't configured yet
 * (placeholder OWNER/REPO) or the network is unavailable.
 */
export function UpdateBanner() {
  const t = useT();
  const [update, setUpdate] = useState<Update | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    check()
      .then((u) => {
        if (alive && u) setUpdate(u);
      })
      .catch(() => {
        /* no endpoint configured / offline — stay silent */
      });
    return () => {
      alive = false;
    };
  }, []);

  if (!update) return null;

  async function install(u: Update) {
    setBusy(true);
    try {
      await u.downloadAndInstall();
      await relaunch();
    } catch {
      setBusy(false);
    }
  }

  return (
    <div className="update-banner">
      <span className="update-banner__msg">{t("update.available", { v: update.version })}</span>
      <button
        className="tbtn tbtn--primary"
        disabled={busy}
        onClick={() => install(update)}
      >
        {busy ? t("update.installing") : t("update.install")}
      </button>
    </div>
  );
}
