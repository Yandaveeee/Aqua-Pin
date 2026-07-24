import Link from "next/link";

export default function NotFound() {
  return (
    <main className="auth-shell">
      <section className="auth-panel auth-panel-single">
        <p className="eyebrow">Not found</p>
        <h1>This page is not available.</h1>
        <p className="muted">Return to AquaPin and continue from the dashboard.</p>
        <Link className="primary-button" href="/">Go to AquaPin</Link>
      </section>
    </main>
  );
}
