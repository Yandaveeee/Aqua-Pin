"use client";

import { ReactNode, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOutAction } from "@/app/auth-actions";
import type { ShellData } from "@/lib/admin-data";
import AdminSidebarNav from "@/components/admin/AdminSidebarNav";
import AdminTopBar from "@/components/admin/AdminTopBar";

type AdminShellProps = {
  children: ReactNode;
  userEmail: string;
  shellData: ShellData;
};

function getEnvironmentLabel() {
  if (process.env.VERCEL_ENV === "preview") return "Staging";
  if (process.env.NODE_ENV === "production") return "Production";
  return "Development";
}

export default function AdminShell({ children, userEmail, shellData }: AdminShellProps) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navItems = [
    { href: "/admin", label: "Dashboard", badge: shellData.navBadges.dashboard },
    { href: "/admin/ponds", label: "Ponds" },
    { href: "/admin/users", label: "Users" },
    { href: "/admin/records", label: "Records" },
    { href: "/admin/settings", label: "Settings", badge: shellData.navBadges.settings },
  ];


  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSidebarOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className={`admin-shell ${sidebarOpen ? "sidebar-open" : ""}`}>
      <button
        aria-hidden={!sidebarOpen}
        className="admin-sidebar-backdrop"
        onClick={() => setSidebarOpen(false)}
        tabIndex={sidebarOpen ? 0 : -1}
        type="button"
      />

      <aside
        aria-label="Admin menu"
        className="admin-sidebar"
        id="admin-sidebar"
      >
        <div className="admin-sidebar-head">
          <div className="brand-lockup">
            <div className="brand-mark">
              <Image
                className="brand-logo"
                src="/media/branding/logo.png"
                alt="AquaPin logo"
                width={48}
                height={48}
              />
              <div>
                <p className="brand-kicker">AquaPin</p>
                <h1 className="brand-title">Admin Console</h1>
              </div>
            </div>
            <p className="brand-caption">{shellData.organizationName}</p>
          </div>

          <button
            aria-label="Close navigation menu"
            className="admin-sidebar-close"
            onClick={() => setSidebarOpen(false)}
            type="button"
          >
            <span />
            <span />
          </button>
        </div>

        <div className="admin-sidebar-navigation">
          <p className="admin-nav-label">Workspace</p>
          <AdminSidebarNav items={navItems} />
        </div>

        <div className="admin-account">
          <div className="admin-account-avatar" aria-hidden="true">
            {userEmail.charAt(0).toUpperCase()}
          </div>
          <div className="admin-account-identity">
            <strong>AquaPin Admin</strong>
            <span title={userEmail}>{userEmail}</span>
          </div>
          <details className="admin-account-menu">
            <summary aria-label="Open account menu" title="Account menu">
              <span />
              <span />
              <span />
            </summary>
            <div className="admin-account-popover">
              <div className="admin-account-context">
                <span>{getEnvironmentLabel()}</span>
                <strong>Admin access</strong>
              </div>
              <Link href="/admin/settings">Account settings</Link>
              <form action={signOutAction}>
                <button type="submit">Sign out</button>
              </form>
            </div>
          </details>
        </div>
      </aside>

      <main className={`admin-main ${pathname.startsWith("/admin/ponds") ? "admin-main-workspace" : ""}`}>
        <AdminTopBar
          organizationName={shellData.organizationName}
          envLabel={getEnvironmentLabel()}
          attentionCount={shellData.attentionCount}
          settingsChanges={shellData.navBadges.settings}
          isSidebarOpen={sidebarOpen}
          onMenuToggle={() => setSidebarOpen((current) => !current)}
        />
        {children}
      </main>
    </div>
  );
}
