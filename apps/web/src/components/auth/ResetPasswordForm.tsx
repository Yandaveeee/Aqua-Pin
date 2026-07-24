"use client";

import { startTransition, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type ResetPasswordFormProps = {
  envLabel: string;
  version: string;
};

export default function ResetPasswordForm({ envLabel, version }: ResetPasswordFormProps) {
  const router = useRouter();
  const [supabase] = useState(() => createSupabaseBrowserClient());
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [hasRecoverySession, setHasRecoverySession] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadSession() {
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      setHasRecoverySession(Boolean(data.session));
      setCheckingSession(false);
    }

    loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event: any, session: any) => {
      if (!active) return;
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setHasRecoverySession(Boolean(session));
        setCheckingSession(false);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setStatus(null);

    if (password.length < 8) {
      setError("Use at least 8 characters for the new password.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (!hasRecoverySession) {
      setError("Open the password recovery link from your email to continue.");
      return;
    }

    setSubmitting(true);

    const { error: updateError } = await supabase.auth.updateUser({
      password,
    });

    if (updateError) {
      setError(updateError.message);
      setSubmitting(false);
      return;
    }

    setStatus("Password updated. Redirecting to sign in.");
    setSubmitting(false);

    startTransition(() => {
      router.push("/login?reset=1");
      router.refresh();
    });
  }

  return (
    <form className="auth-console-card" onSubmit={handleSubmit}>
      <div className="auth-console-header">
        <div className="auth-console-meta">
          <span className="auth-env-pill">{envLabel}</span>
          <span className="auth-version-pill">v{version}</span>
        </div>
        <h1>Reset Password</h1>
        <p className="auth-console-subtitle">Create a new password for AquaPin Operations Console</p>
        <p className="auth-console-note">
          Use the recovery link from your email, then enter your new password here.
        </p>
      </div>

      {checkingSession ? <p className="muted">Checking recovery session...</p> : null}

      <label className="field-label" htmlFor="new-password">
        New password
      </label>
      <div className="auth-password-wrap">
        <input
          className="field-input auth-password-input"
          id="new-password"
          type={showPassword ? "text" : "password"}
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        <button
          className="auth-input-action"
          type="button"
          onClick={() => setShowPassword((current) => !current)}
          aria-label={showPassword ? "Hide password" : "Show password"}
        >
          {showPassword ? "Hide" : "Show"}
        </button>
      </div>

      <label className="field-label" htmlFor="confirm-password">
        Confirm new password
      </label>
      <input
        className="field-input"
        id="confirm-password"
        type={showPassword ? "text" : "password"}
        autoComplete="new-password"
        value={confirmPassword}
        onChange={(event) => setConfirmPassword(event.target.value)}
        required
      />

      {status ? <p className="flash-success">{status}</p> : null}
      {error ? <p className="error-text">{error}</p> : null}

      <button className="primary-button auth-submit" type="submit" disabled={submitting}>
        {submitting ? "Updating password..." : "Update Password"}
      </button>

      <div className="auth-console-footer">
        <span>Need a fresh link?</span>
        <a className="auth-link-button" href="/login">
          Back to sign in
        </a>
      </div>
    </form>
  );
}
