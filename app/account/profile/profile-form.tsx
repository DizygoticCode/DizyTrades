"use client";

import { FormEvent, useRef, useState } from "react";
import type { AccountProfile } from "../../lib/auth-db";

export default function ProfileForm({ initial }: { initial: AccountProfile }) {
  const [profile, setProfile] = useState(initial);
  const [displayName, setDisplayName] = useState(initial.displayName);
  const [bio, setBio] = useState(initial.bio);
  const [saving, setSaving] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const avatarInput = useRef<HTMLInputElement>(null);
  const avatarUrl = profile.hasAvatar ? `/api/account/avatar?v=${profile.avatarUpdatedAt || 0}` : null;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/account/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName, bio }),
      });
      const payload = await response.json() as { profile?: AccountProfile; error?: string };
      if (!response.ok || !payload.profile) throw new Error(payload.error || "Profile could not be saved.");
      setProfile(payload.profile);
      setDisplayName(payload.profile.displayName);
      setBio(payload.profile.bio);
      setMessage("Profile saved. Your DizyTrades account badge will use the new display name on the next page load.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Profile could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function uploadAvatar(file: File) {
    setAvatarBusy(true);
    setError("");
    setMessage("");
    try {
      const body = new FormData();
      body.set("avatar", file);
      const response = await fetch("/api/account/avatar", { method: "POST", body });
      const payload = await response.json() as { profile?: AccountProfile; error?: string };
      if (!response.ok || !payload.profile) throw new Error(payload.error || "Avatar could not be saved.");
      setProfile(payload.profile);
      setMessage("Avatar updated.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Avatar could not be saved.");
    } finally {
      setAvatarBusy(false);
      if (avatarInput.current) avatarInput.current.value = "";
    }
  }

  async function removeAvatar() {
    setAvatarBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/account/avatar", { method: "DELETE" });
      const payload = await response.json() as { profile?: AccountProfile; error?: string };
      if (!response.ok || !payload.profile) throw new Error(payload.error || "Avatar could not be removed.");
      setProfile(payload.profile);
      setMessage("Avatar removed.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Avatar could not be removed.");
    } finally {
      setAvatarBusy(false);
    }
  }

  return <div className="profile-page-card">
    <header className="profile-page-header">
      <div>
        <p className="profile-page-eyebrow">PERSONAL ACCOUNT</p>
        <h1>Your DizyTrades profile</h1>
        <p>Manage the identity shown around your personal workspace. Account permissions remain controlled by DizyTrades.</p>
      </div>
      <nav className="profile-page-actions" aria-label="Profile actions">
        {profile.role === "owner" ? <a href="/account">DizyAccount Companion</a> : null}
        <a href="/terminal">Back to terminal</a>
      </nav>
    </header>

    <section className="profile-page-grid">
      <aside className="profile-avatar-card">
        <div className="profile-avatar" aria-label="Current profile avatar">
          {avatarUrl ? <img alt="" src={avatarUrl} /> : <span>{profile.displayName.slice(0, 1).toUpperCase()}</span>}
        </div>
        <strong>{profile.displayName}</strong>
        <span>{profile.role}</span>
        <input
          accept="image/png,image/jpeg,image/webp"
          className="profile-avatar-input"
          disabled={avatarBusy}
          onChange={(event) => { const file = event.currentTarget.files?.[0]; if (file) void uploadAvatar(file); }}
          ref={avatarInput}
          type="file"
        />
        <button disabled={avatarBusy} onClick={() => avatarInput.current?.click()} type="button">{avatarBusy ? "Updating…" : "Upload avatar"}</button>
        {profile.hasAvatar ? <button className="secondary" disabled={avatarBusy} onClick={() => void removeAvatar()} type="button">Remove avatar</button> : null}
        <small>PNG, JPEG or WebP · maximum 512 KB</small>
      </aside>

      <form className="profile-details-card" onSubmit={save}>
        <label><span>Display name</span><input maxLength={64} onChange={(event) => setDisplayName(event.target.value)} required value={displayName} /></label>
        <label><span>Sign-in email</span><input readOnly value={profile.email || "Legacy account email"} /><small>{profile.credentialSource === "database" ? profile.emailVerified ? "Verified email" : "Verification required" : "Legacy owner/admin credential managed in Render"}</small></label>
        <label><span>Role</span><input readOnly value={profile.role} /><small>Roles cannot be changed from a personal profile.</small></label>
        <label><span>About / notes</span><textarea maxLength={500} onChange={(event) => setBio(event.target.value)} placeholder="Optional profile details" rows={6} value={bio} /><small>{bio.length}/500</small></label>
        {error ? <div className="login-error" role="alert">{error}</div> : null}
        {message ? <div className="profile-success" role="status">{message}</div> : null}
        <button disabled={saving} type="submit">{saving ? "Saving…" : "Save profile"}</button>
        {profile.credentialSource === "database" ? <a className="profile-reset-link" href="/forgot-password">Reset my password by email</a> : <p className="profile-legacy-note">This owner/admin login still uses the protected Render credential boundary. Self-service password resets apply to verified SQLite signup accounts.</p>}
      </form>
    </section>
  </div>;
}
