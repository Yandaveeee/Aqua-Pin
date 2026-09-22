"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

export type AdminNavItem = {
  href: string;
  label: string;
  badge?: number;
};

type AdminSidebarNavProps = {
  groups: Array<{ label: string; items: AdminNavItem[] }>;
};

function isActivePath(pathname: string, href: string) {
  if (href === "/admin") {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function AdminSidebarNav({ groups }: AdminSidebarNavProps) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <nav className="admin-nav-groups" aria-label="Admin navigation">
      {groups.map((group) => (
        <section className="admin-nav-group" key={group.label} aria-label={group.label}>
          <p className="admin-nav-label">{group.label}</p>
          <div className="admin-nav">
            {group.items.map((item) => {
              const active = isActivePath(pathname, item.href);

              return (
                <Link
                  className={`admin-nav-link ${active ? "is-active" : ""}`}
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  onMouseEnter={() => { if (!active) router.prefetch(item.href); }}
                  onFocus={() => { if (!active) router.prefetch(item.href); }}
                >
                  <span>{item.label}</span>
                  {item.badge && item.badge > 0 ? (
                    <span className="admin-nav-badge" aria-label={`${item.badge} items`}>
                      {item.badge}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </nav>
  );
}
