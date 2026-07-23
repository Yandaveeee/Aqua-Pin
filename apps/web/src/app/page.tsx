import Image from "next/image";
import Link from "next/link";

const navLinks = [
  { href: "#home", label: "Home" },
  { href: "#about", label: "About" },
  { href: "#features", label: "Features" },
  { href: "#how-it-works", label: "How It Works" },
  { href: "#contact", label: "Contact" },
];

const highlights = [
  { icon: "pin", label: "Geotagged ponds", value: "Real-time" },
  { icon: "trend", label: "Field operations", value: "Easy to review" },
  { icon: "shield", label: "Admin access", value: "Secure & reliable" },
];

const features = [
  {
    icon: "pin",
    title: "Geotagging & Mapping",
    description: "View every mapped pond with its precise location and boundary.",
  },
  {
    icon: "water",
    title: "Pond Monitoring",
    description: "Check pond status, stock details, and assigned field staff.",
  },
  {
    icon: "record",
    title: "Field Records",
    description: "Review stocking, mortality, and harvest entries from the mobile app.",
  },
  {
    icon: "users",
    title: "User Directory",
    description: "See the administrators and field staff working across the farm.",
  },
  {
    icon: "settings",
    title: "Essential Settings",
    description: "Manage the core preferences needed for daily operations.",
  },
];

const steps = [
  {
    number: "01",
    title: "Map the ponds",
    description: "Field staff capture each pond location and boundary from the mobile app.",
  },
  {
    number: "02",
    title: "Record field activity",
    description: "Stocking, mortality, and harvest updates are saved where the work happens.",
  },
  {
    number: "03",
    title: "Review operations",
    description: "Administrators see pond, staff, and record information in one clean console.",
  },
];

type IconName = "pin" | "trend" | "shield" | "water" | "record" | "users" | "settings";

function LandingIcon({ name }: { name: IconName }) {
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

  if (name === "shield") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3 5 6v5c0 4.6 2.8 8.1 7 10 4.2-1.9 7-5.4 7-10V6l-7-3Z" />
        <path d="m9 12 2 2 4-4" />
      </svg>
    );
  }

  if (name === "water") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3c3.2 4 5 6.5 5 9a5 5 0 0 1-10 0c0-2.5 1.8-5 5-9Z" />
        <path d="M9.5 13.5c.6 1.2 1.4 1.8 2.5 1.8" />
      </svg>
    );
  }

  if (name === "record") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 3h9l4 4v14H6V3Z" />
        <path d="M15 3v5h4M9 12h6M9 16h6" />
      </svg>
    );
  }

  if (name === "users") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="9" cy="8" r="3" />
        <path d="M3.5 19v-1.5A4.5 4.5 0 0 1 8 13h2a4.5 4.5 0 0 1 4.5 4.5V19" />
        <path d="M15 6.5a3 3 0 0 1 0 5.5M17 14a4 4 0 0 1 3.5 4v1" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M4.9 4.9 7 7M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1" />
    </svg>
  );
}

export default function HomePage() {
  return (
    <main className="aquapin-landing">
      <header className="aquapin-header">
        <div className="aquapin-header-inner">
          <Link className="aquapin-brand" href="#home" aria-label="AquaPin home">
            <Image
              src="/media/branding/logo.png"
              alt=""
              width={56}
              height={56}
              priority
            />
            <span className="aquapin-brand-copy">
              <strong>AquaPin</strong>
              <small>Map. Monitor. Manage.</small>
            </span>
          </Link>

          <nav className="aquapin-nav" aria-label="Main navigation">
            {navLinks.map((item) => (
              <Link href={item.href} key={item.href}>
                {item.label}
              </Link>
            ))}
          </nav>

          <Link className="aquapin-login" href="/login">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="8" r="3.5" />
              <path d="M5 21v-2a7 7 0 0 1 14 0v2" />
            </svg>
            Login
          </Link>
        </div>
      </header>

      <section className="aquapin-hero" id="home" aria-labelledby="aquapin-hero-title">
        <Image
          className="aquapin-hero-image"
          src="/media/landing/aquaculture-hero-v2.png"
          alt="Aquaculture ponds surrounded by tropical mountains"
          fill
          sizes="100vw"
          priority
        />
        <div className="aquapin-hero-shade" />

        <div className="aquapin-hero-inner">
          <div className="aquapin-hero-copy">
            <h1 id="aquapin-hero-title">
              Smart Mapping.
              <span>Smarter Aquaculture.</span>
            </h1>
            <p>
              AquaPin is a geotagging and geospatial mapping system that helps aquaculture
              administrators monitor ponds, review field activity, and make informed operational
              decisions.
            </p>
          </div>

          <div className="aquapin-highlights" aria-label="AquaPin highlights">
            {highlights.map((item) => (
              <article key={item.label}>
                <span className="aquapin-icon">
                  <LandingIcon name={item.icon as IconName} />
                </span>
                <span>
                  <small>{item.label}</small>
                  <strong>{item.value}</strong>
                </span>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="aquapin-features" id="features" aria-labelledby="features-title">
        <div className="aquapin-section-heading">
          <p>Features</p>
          <h2 id="features-title">Everything needed for daily aquaculture operations</h2>
          <span>
            A focused set of tools that mirrors the work captured by the AquaPin mobile app.
          </span>
        </div>

        <div className="aquapin-feature-grid">
          {features.map((feature) => (
            <article className="aquapin-feature-card" key={feature.title}>
              <span className="aquapin-icon aquapin-icon-large">
                <LandingIcon name={feature.icon as IconName} />
              </span>
              <h3>{feature.title}</h3>
              <p>{feature.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="aquapin-about" id="about" aria-labelledby="about-title">
        <div>
          <p className="aquapin-eyebrow">About AquaPin</p>
          <h2 id="about-title">Built around the information that farm teams actually need</h2>
        </div>
        <p>
          AquaPin connects mobile field records with a simple web console. It keeps pond
          locations, staff information, and operational records organized without filling the
          dashboard with unrelated tools.
        </p>
      </section>

      <section className="aquapin-process" id="how-it-works" aria-labelledby="process-title">
        <div className="aquapin-section-heading">
          <p>How it works</p>
          <h2 id="process-title">From the pond to the admin console</h2>
        </div>
        <div className="aquapin-step-grid">
          {steps.map((step) => (
            <article key={step.number}>
              <span>{step.number}</span>
              <h3>{step.title}</h3>
              <p>{step.description}</p>
            </article>
          ))}
        </div>
      </section>

      <footer className="aquapin-footer" id="contact">
        <div>
          <strong>AquaPin</strong>
          <p>A geotagging and geospatial mapping system for aquaculture management.</p>
        </div>
        <nav aria-label="Footer navigation">
          <Link href="#about">About</Link>
          <Link href="#features">Features</Link>
          <Link href="#how-it-works">How It Works</Link>
          <Link href="/login">Login</Link>
        </nav>
      </footer>
    </main>
  );
}
