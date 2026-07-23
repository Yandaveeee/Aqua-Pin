import Image from "next/image";
import type { ReactNode } from "react";

type AuthSplitShellProps = {
  children: ReactNode;
};

type AuthFeatureIcon = "pin" | "trend" | "shield";

function FeatureIcon({ name }: { name: AuthFeatureIcon }) {
  if (name === "pin") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
        <circle cx="12" cy="10" r="2.5" />
      </svg>
    );
  }

  if (name === "trend") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 19V5M4 19h16M7 15l4-4 3 2 5-6" />
        <path d="M15 7h4v4" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3 5 6v5c0 4.6 2.8 8.1 7 10 4.2-1.9 7-5.4 7-10V6l-7-3Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

export default function AuthSplitShell({ children }: AuthSplitShellProps) {
  return (
    <main className="auth-shell auth-redesign">
      <section className="auth-hero-panel">
        <div className="auth-hero-inner">
          <div className="auth-hero-brand">
            <Image
              className="auth-hero-logo"
              src="/media/branding/logo.png"
              alt="AquaPin logo"
              width={64}
              height={64}
              priority
            />
            <div className="auth-hero-brandcopy">
              <p>AquaPin</p>
              <span>Map. Monitor. Manage.</span>
            </div>
          </div>

          <div className="auth-hero-message">
            <h1>
              Welcome back!
              <span>Sign in to continue</span>
            </h1>
            <p className="auth-hero-copy">
              Access your dashboard to monitor ponds, review operations, and make informed
              decisions for smarter aquaculture.
            </p>
          </div>

          <div className="auth-hero-features">
            <article>
              <span className="auth-hero-feature-icon">
                <FeatureIcon name="pin" />
              </span>
              <span>
                <strong>Smart Mapping</strong>
                <small>Visualize and monitor pond locations in real time.</small>
              </span>
            </article>
            <article>
              <span className="auth-hero-feature-icon">
                <FeatureIcon name="trend" />
              </span>
              <span>
                <strong>Operational Insights</strong>
                <small>Review field activities and pond information effortlessly.</small>
              </span>
            </article>
            <article>
              <span className="auth-hero-feature-icon">
                <FeatureIcon name="shield" />
              </span>
              <span>
                <strong>Secure &amp; Reliable</strong>
                <small>Your operational data stays protected and accessible.</small>
              </span>
            </article>
          </div>

          <div className="auth-hero-trust">
            <FeatureIcon name="shield" />
            <span>Secure access for AquaPin administrators.</span>
          </div>
        </div>
      </section>

      <section className="auth-panel">{children}</section>
    </main>
  );
}
