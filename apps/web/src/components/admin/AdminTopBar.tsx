"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";

type AdminTopBarProps = {
  organizationName: string;
  envLabel: string;
  attentionCount: number;
  settingsChanges: number;
  isSidebarOpen: boolean;
  onMenuToggle: () => void;
};

type PageMeta = {
  title: string;
  description: string;
  shortcuts: Array<{ href: string; label: string; badge?: number }>;
};

function getPageMeta(
  pathname: string,
  settingsChanges: number
): PageMeta {
  if (pathname.startsWith("/admin/users")) {
    return {
      title: "Users",
      description: "View the staff accounts using AquaPin in the field.",
      shortcuts: [
        { href: "/admin", label: "Dashboard" },
        { href: "/admin/records", label: "Records" },
      ],
    };
  }

  if (pathname.startsWith("/admin/ponds")) {
    return {
      title: "Ponds",
      description: "Inspect pond locations, boundaries, stock, and current status.",
      shortcuts: [],
    };
  }

  if (pathname.startsWith("/admin/records")) {
    return {
      title: "Records",
      description: "Review stocking, mortality, and harvest entries sent from the mobile app.",
      shortcuts: [
        { href: "/admin/ponds", label: "Ponds" },
        { href: "/admin/users", label: "Users" },
      ],
    };
  }

  if (pathname.startsWith("/admin/settings")) {
    return {
      title: "Settings & Audit",
      description: "Manage typed configuration, review diffs, and restore recent changes.",
      shortcuts: [
        { href: "/admin", label: "Dashboard" },
        { href: "/admin/users", label: "Users" },
      ],
    };
  }

  return {
    title: "Operations",
    description: "Track pond health and field activity.",
    shortcuts: [
      { href: "/admin/users", label: "Users" },
      { href: "/admin/settings", label: "Settings", badge: settingsChanges },
    ],
  };
}

export default function AdminTopBar({
  organizationName,
  envLabel,
  attentionCount,
  settingsChanges,
  isSidebarOpen,
  onMenuToggle,
}: AdminTopBarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const pageMeta = getPageMeta(pathname, settingsChanges);

  return (
    <header className="admin-topbar">
      <div className="admin-topbar-main">
        <button
          aria-controls="admin-sidebar"
          aria-expanded={isSidebarOpen}
          aria-label={isSidebarOpen ? "Close navigation menu" : "Open navigation menu"}
          className="admin-menu-toggle"
          onClick={onMenuToggle}
          type="button"
        >
          <span className="admin-menu-toggle-icon" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span className="admin-menu-toggle-label">Menu</span>
        </button>

        <div className="admin-topbar-copy">
          <div className="admin-topbar-meta">
            <span className="ui-pill ui-pill-ghost">{organizationName}</span>
            <span className="ui-pill ui-pill-info">{envLabel}</span>
            <span className={`ui-pill ${attentionCount > 0 ? "ui-pill-warning" : "ui-pill-success"}`}>
              {attentionCount > 0 ? (
                <>
                  <span className="admin-attention-count">{attentionCount}</span>
                  <span className="admin-attention-label"> attention items</span>
                </>
              ) : (
                "Operations stable"
              )}
            </span>
          </div>
          <div className="admin-topbar-heading">
            <h1>{pageMeta.title}</h1>
            <p>{pageMeta.description}</p>
          </div>
        </div>
      </div>

      <div className="admin-topbar-actions">
        <button
          className="secondary-button admin-action-button admin-action-refresh"
          type="button"
          onClick={() => startRefresh(() => router.refresh())}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="M20 6v5h-5" />
            <path d="M18.4 15a7 7 0 1 1-.8-7.8L20 11" />
          </svg>
          <span>{refreshing ? "Refreshing..." : "Refresh"}</span>
        </button>

        {pageMeta.shortcuts.map((shortcut) => (
          <Link
            className={`secondary-button admin-shortcut admin-action-button admin-action-${shortcut.label.toLowerCase()}`}
            key={shortcut.href}
            href={shortcut.href}
          >
            {shortcut.label === "Users" ? (
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M19 8v6M22 11h-6" />
              </svg>
            ) : shortcut.label === "Settings" ? (
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.1A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3v-4h.1A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.1A1.7 1.7 0 0 0 15.4 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.17.38.38.72.6 1 .28.36.67.57 1.1.6h.1v4h-.1a1.7 1.7 0 0 0-1.7.4Z" />
              </svg>
            ) : null}
            <span>{shortcut.label}</span>
            {shortcut.badge && shortcut.badge > 0 ? (
              <span className="button-badge">{shortcut.badge}</span>
            ) : null}
          </Link>
        ))}
      </div>
    </header>
  );
}
