import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useRepos } from "../../store/repos";
import { repoIdentity } from "../../ipc/commands";
import { useT } from "../../i18n/useT";
import type { Profile } from "../../types/git";

const inputProps = {
  autoComplete: "off",
  autoCorrect: "off",
  autoCapitalize: "off",
  spellCheck: false,
} as const;

const BLANK: Profile = {
  id: 0,
  name: "",
  userName: "",
  userEmail: "",
  signingKey: "",
  signingFormat: "",
  sshKeyPath: "",
};

/**
 * Identity profiles (SPEC #6): create reusable git identities (name/email +
 * optional signing key + SSH key) and apply them to the open repo's local
 * config — GitKraken-style profile switching.
 */
export function ProfilesPanel() {
  const t = useT();
  const profilesOpen = useRepos((s) => s.profilesOpen);
  const setProfilesOpen = useRepos((s) => s.setProfilesOpen);
  const profiles = useRepos((s) => s.profiles);
  const saveProfile = useRepos((s) => s.saveProfile);
  const deleteProfile = useRepos((s) => s.deleteProfile);
  const applyProfile = useRepos((s) => s.applyProfile);
  const selected = useRepos((s) => s.selected);
  const profileByRepo = useRepos((s) => s.profileByRepo);
  const busy = useRepos((s) => s.busy);

  const activeId = selected ? profileByRepo[selected.path] : undefined;

  const [editing, setEditing] = useState<Profile | null>(null);
  const [identity, setIdentity] = useState<[string, string] | null>(null);

  // Show the open repo's current identity so the user sees what they're changing.
  useEffect(() => {
    if (!profilesOpen || !selected) {
      setIdentity(null);
      return;
    }
    let alive = true;
    repoIdentity(selected.path)
      .then((id) => alive && setIdentity(id))
      .catch(() => alive && setIdentity(null));
    return () => {
      alive = false;
    };
  }, [profilesOpen, selected, busy]);

  if (!profilesOpen) return null;

  const close = () => {
    setEditing(null);
    setProfilesOpen(false);
  };

  const set = (patch: Partial<Profile>) => setEditing((e) => (e ? { ...e, ...patch } : e));

  async function browseSshKey() {
    const f = await open({ directory: false, multiple: false, title: "Select SSH private key" });
    if (typeof f === "string") set({ sshKeyPath: f });
  }

  async function save() {
    if (!editing || !editing.name.trim()) return;
    await saveProfile(editing);
    setEditing(null);
  }

  return (
    <div className="modal-backdrop" onClick={close}>
      <div className="settings" onClick={(e) => e.stopPropagation()}>
        <div className="settings__head">
          <span className="settings__title">{t("profiles.title")}</span>
          <button className="toast__close" onClick={close} title="Close">
            ✕
          </button>
        </div>

        <div className="settings__body">
          {selected && (
            <div className="profiles-current">
              <span className="profiles-current__label">
                {t("profiles.current")} — {selected.alias ?? selected.name}
              </span>
              <span className="profiles-current__val">
                {identity && (identity[0] || identity[1])
                  ? `${identity[0] || "—"} <${identity[1] || "—"}>`
                  : t("profiles.notSet")}
              </span>
            </div>
          )}

          {editing ? (
            <div className="settings__group">
              <h4>{editing.id ? t("profiles.edit") : t("profiles.new")}</h4>
              <input
                className="modal-input"
                placeholder={t("profiles.namePh")}
                value={editing.name}
                autoFocus
                {...inputProps}
                onChange={(e) => set({ name: e.target.value })}
              />
              <input
                className="modal-input"
                placeholder="user.name"
                value={editing.userName}
                {...inputProps}
                onChange={(e) => set({ userName: e.target.value })}
              />
              <input
                className="modal-input"
                placeholder="user.email"
                value={editing.userEmail}
                {...inputProps}
                onChange={(e) => set({ userEmail: e.target.value })}
              />
              <div className="settings__row">
                <select
                  className="sign-select"
                  value={editing.signingFormat}
                  onChange={(e) => set({ signingFormat: e.target.value })}
                >
                  <option value="">{t("profiles.noSigning")}</option>
                  <option value="openpgp">GPG (openpgp)</option>
                  <option value="ssh">SSH</option>
                </select>
                <input
                  className="modal-input"
                  placeholder={
                    editing.signingFormat === "ssh"
                      ? t("profiles.signKeyPathPh")
                      : t("profiles.signKeyIdPh")
                  }
                  value={editing.signingKey}
                  disabled={!editing.signingFormat}
                  {...inputProps}
                  onChange={(e) => set({ signingKey: e.target.value })}
                />
              </div>
              <div className="settings__row">
                <input
                  className="modal-input"
                  placeholder={t("profiles.sshPh")}
                  value={editing.sshKeyPath}
                  {...inputProps}
                  onChange={(e) => set({ sshKeyPath: e.target.value })}
                />
                <button className="tbtn" onClick={browseSshKey}>
                  {t("profiles.browse")}
                </button>
              </div>
              <div className="modal-actions">
                <button className="tbtn" onClick={() => setEditing(null)}>
                  {t("common.cancel")}
                </button>
                <button className="tbtn tbtn--primary" disabled={!editing.name.trim()} onClick={save}>
                  {t("common.save")}
                </button>
              </div>
            </div>
          ) : (
            <div className="settings__group">
              <div className="profiles-head">
                <h4>{t("profiles.saved")}</h4>
                <button className="tbtn" onClick={() => setEditing({ ...BLANK })}>
                  {t("profiles.addNew")}
                </button>
              </div>
              {profiles.length === 0 && (
                <div className="profiles-empty">{t("profiles.empty")}</div>
              )}
              {profiles.map((p) => (
                <div key={p.id} className="profile-row">
                  <div className="profile-row__main">
                    <span className="profile-row__name">
                      {p.name}
                      {p.id === activeId && (
                        <span className="profile-row__active">{t("profiles.active")}</span>
                      )}
                    </span>
                    <span className="profile-row__id">
                      {p.userName || "—"} &lt;{p.userEmail || "—"}&gt;
                      {p.signingFormat && (
                        <span className="profile-row__sign"> · {t("profiles.signs")}</span>
                      )}
                    </span>
                  </div>
                  <div className="profile-row__actions">
                    <button
                      className="tbtn tbtn--primary"
                      disabled={!selected || !!busy}
                      title={selected ? "Apply to the open repo (local config)" : "Open a repo first"}
                      onClick={() => applyProfile(p)}
                    >
                      {t("profiles.apply")}
                    </button>
                    <button
                      className="tbtn"
                      disabled={!!busy}
                      title="Set as the global git identity (~/.gitconfig)"
                      onClick={() => applyProfile(p, true)}
                    >
                      {t("profiles.global")}
                    </button>
                    <button className="link-btn" onClick={() => setEditing({ ...p })}>
                      {t("profiles.editAction")}
                    </button>
                    <button className="link-btn link-btn--danger" onClick={() => deleteProfile(p.id)}>
                      {t("profiles.delete")}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
