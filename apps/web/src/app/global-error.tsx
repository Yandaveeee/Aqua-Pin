"use client";

import Link from "next/link";

export default function GlobalError() {
  return (
    <html lang="en">
      <body>
        <main className="auth-shell">
          <section className="auth-panel auth-panel-single">
            <p className="eyebrow">Something went wrong</p>
            <h1>Unable to load AquaPin.</h1>
            <p className="muted">Please refresh the page or return to the home page.</p>
            <Link className="primary-button" href="/">Go to AquaPin</Link>
          </section>
        </main>
      </body>
    </html>
  );
}
