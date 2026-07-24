"use client";

export default function GlobalError() {
  return (
    <html lang="en">
      <body>
        <main className="auth-shell">
          <section className="auth-panel auth-panel-single">
            <p className="eyebrow">Something went wrong</p>
            <h1>Unable to load AquaPin.</h1>
            <p className="muted">Please refresh the page or return to the home page.</p>
            {/* Keep the root error boundary independent from Next router context. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a className="primary-button" href="/">Go to AquaPin</a>
          </section>
        </main>
      </body>
    </html>
  );
}
