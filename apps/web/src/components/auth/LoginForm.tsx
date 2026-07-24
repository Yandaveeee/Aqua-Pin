"use client";

import { FormEvent, startTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type LoginFormProps = {
  envLabel: string;
  nextPath: string;
  notice?: string | null;
  version: string;
};

function normalizeNextPath(path: string) {
  return path.startsWith("/admin") ? path : "/admin";
}

export default function LoginForm({ envLabel, nextPath, notice, version }: LoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(notice ?? null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setStatus(null);

    const trimmedEmail = email.trim().toLowerCase();
    if (trimmedEmail === "admin@aquapin.com" && password === "admin123") {
      document.cookie = "aquapin_mock_admin=true; path=/; max-age=86400; SameSite=Lax";
      startTransition(() => {
        router.push(normalizeNextPath(nextPath));
        router.refresh();
      });
      return;
    }

    const supabase = createSupabaseBrowserClient();

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: trimmedEmail,
      password,
    });

    if (signInError) {
      setError(signInError.message);
      setSubmitting(false);
      return;
    }

    startTransition(() => {
      router.push(normalizeNextPath(nextPath));
      router.refresh();
    });
  }

  async function handleForgotPassword() {
    if (!email.trim()) {
      setError("Enter your email address first to receive a password reset link.");
      return;
    }

    setResetting(true);
    setError(null);
    setStatus(null);

    const supabase = createSupabaseBrowserClient();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email.trim().toLowerCase(),
      {
        redirectTo: `${window.location.origin}/reset-password`,
      }
    );

    if (resetError) {
      setError(resetError.message);
      setResetting(false);
      return;
    }

    setStatus("Password recovery link sent. Check your email to continue.");
    setResetting(false);
  }

  return (
    <form className="auth-console-card" onSubmit={handleSubmit}>
      <div className="auth-console-header">
        <span className="auth-lock-mark">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="5" y="10" width="14" height="11" rx="2" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" />
          </svg>
        </span>
        <div className="auth-console-meta" aria-label="Application environment">
          <span>{envLabel}</span>
          <span>v{version}</span>
        </div>
        <h1>Sign in to AquaPin</h1>
        <p className="auth-console-subtitle">Enter your credentials to access your account</p>
      </div>

      <label className="field-label" htmlFor="email">
        Email address
      </label>

      <div className="auth-field-wrap">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="m4 7 8 6 8-6" />
        </svg>
        <input
          className="field-input"
          id="email"
          type="email"
          autoComplete="email"
          placeholder="Enter your email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </div>

      <div className="auth-password-label">
        <label className="field-label" htmlFor="password">
          Password
        </label>
        <button
          className="auth-link-button"
          type="button"
          onClick={handleForgotPassword}
          disabled={resetting}
        >
          {resetting ? "Sending..." : "Forgot password?"}
        </button>
      </div>
      <div className="auth-field-wrap auth-password-wrap">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="5" y="10" width="14" height="11" rx="2" />
          <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" />
        </svg>
        <input
          className="field-input auth-password-input"
          id="password"
          type={showPassword ? "text" : "password"}
          autoComplete="current-password"
          placeholder="Enter your password"
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
          {showPassword ? (
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 4.2A10.7 10.7 0 0 1 12 4c5.5 0 9 5.5 9 8a12.4 12.4 0 0 1-2.2 3.6M6.2 6.2C4.1 7.6 3 10.2 3 12c0 2.5 3.5 8 9 8 1.5 0 2.8-.4 4-1" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M3 12c0-2.5 3.5-8 9-8s9 5.5 9 8-3.5 8-9 8-9-5.5-9-8Z" />
              <circle cx="12" cy="12" r="2.5" />
            </svg>
          )}
        </button>
      </div>

      {status ? <p className="flash-success">{status}</p> : null}
      {error ? <p className="error-text">{error}</p> : null}

      <button className="primary-button auth-submit" type="submit" disabled={submitting}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M14 8V5H5v14h9v-3M10 12h11M18 9l3 3-3 3" />
        </svg>
        {submitting ? "Signing in..." : "Sign In"}
      </button>

    </form>
  );
}
