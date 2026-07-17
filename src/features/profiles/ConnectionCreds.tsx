import { useEffect, useState } from "react";
import { useRepos } from "../../store/repos";
import {
  connectionInfo,
  credSetHttps,
  credClearHttps,
  credSetSsh,
  credClearSsh,
} from "../../ipc/commands";
import { useT } from "../../i18n/useT";
import type { ConnectionInfo } from "../../types/git";

const inputProps = {
  autoComplete: "off",
  autoCorrect: "off",
  autoCapitalize: "off",
  spellCheck: false,
} as const;

/**
 * Enter passwords for the open repo's remote connection: an HTTPS
 * username/password, or an SSH key passphrase. Secrets are stored in the OS
 * keychain (backend `creds`) and used to authenticate fetch/pull/push without
 * a terminal prompt. No secret is ever read back into the UI.
 */
export function ConnectionCreds() {
  const t = useT();
  const selected = useRepos((s) => s.selected);
  const [info, setInfo] = useState<ConnectionInfo | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const path = selected?.path;

  useEffect(() => {
    if (!path) {
      setInfo(null);
      return;
    }
    let alive = true;
    connectionInfo(path)
      .then((i) => alive && setInfo(i))
      .catch(() => alive && setInfo(null));
    return () => {
      alive = false;
    };
  }, [path]);

  // Prefill the username field with the stored one (if any).
  useEffect(() => {
    setUsername(info?.httpsUsername ?? "");
  }, [info?.httpsUsername]);

  if (!selected) return null;

  async function run(fn: () => Promise<void>) {
    if (!path) return;
    setBusy(true);
    setErr(null);
    try {
      await fn();
      const next = await connectionInfo(path);
      setInfo(next);
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="settings__group conn">
      <h4>{t("conn.title")}</h4>
      {!info || !info.host ? (
        <div className="conn__hint">{t("conn.noRemote")}</div>
      ) : (
        <>
          <div className="conn__host">
            {info.host} · {info.scheme}
          </div>

          {info.scheme === "https" && (
            <div className="conn__block">
              <input
                className="modal-input"
                placeholder={t("conn.userPh")}
                value={username}
                {...inputProps}
                onChange={(e) => setUsername(e.target.value)}
              />
              <input
                className="modal-input"
                type="password"
                placeholder={info.hasHttpsCred ? t("conn.stored") : t("conn.pwPh")}
                value={password}
                {...inputProps}
                onChange={(e) => setPassword(e.target.value)}
              />
              <div className="modal-actions">
                {info.hasHttpsCred && (
                  <button
                    className="link-btn link-btn--danger"
                    disabled={busy}
                    onClick={() => run(() => credClearHttps(info.host))}
                  >
                    {t("conn.clear")}
                  </button>
                )}
                <button
                  className="tbtn tbtn--primary"
                  disabled={busy || !username.trim() || !password}
                  onClick={() =>
                    run(async () => {
                      await credSetHttps(info.host, username.trim(), password);
                      setPassword("");
                    })
                  }
                >
                  {t("common.save")}
                </button>
              </div>
            </div>
          )}

          {info.scheme === "ssh" &&
            (info.sshKey ? (
              <div className="conn__block">
                <div className="conn__key" title={info.sshKey}>
                  {info.sshKey}
                </div>
                <input
                  className="modal-input"
                  type="password"
                  placeholder={info.hasSshPassphrase ? t("conn.stored") : t("conn.ppPh")}
                  value={passphrase}
                  {...inputProps}
                  onChange={(e) => setPassphrase(e.target.value)}
                />
                <div className="modal-actions">
                  {info.hasSshPassphrase && (
                    <button
                      className="link-btn link-btn--danger"
                      disabled={busy}
                      onClick={() => run(() => credClearSsh(info.sshKey))}
                    >
                      {t("conn.clear")}
                    </button>
                  )}
                  <button
                    className="tbtn tbtn--primary"
                    disabled={busy || !passphrase}
                    onClick={() =>
                      run(async () => {
                        await credSetSsh(info.sshKey, passphrase);
                        setPassphrase("");
                      })
                    }
                  >
                    {t("common.save")}
                  </button>
                </div>
              </div>
            ) : (
              <div className="conn__hint">{t("conn.noSshKey")}</div>
            ))}

          {err && <div className="keygen__err">{err}</div>}
        </>
      )}
    </div>
  );
}
