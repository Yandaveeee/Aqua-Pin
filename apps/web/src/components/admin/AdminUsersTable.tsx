"use client";

import { useRouter } from "next/navigation";
import { formatDateTime, formatRelativeTime } from "@/lib/admin-format";

export type AdminUserListItem = {
  id: string;
  fullName: string;
  email: string;
  role: "admin" | "field_staff";
  status: "pending" | "approved";
  createdAt: string;
  lastLoginAt: string | null;
  locationLabel: string | null;
  region: string | null;
};

export default function AdminUsersTable({ users }: { users: AdminUserListItem[] }) {
  const router = useRouter();

  const openUser = (id: string) => {
    router.push(`/admin/users/${encodeURIComponent(id)}`);
  };

  return (
    <div className="table-wrap user-directory-wrap">
      <table className="data-table user-directory-table">
        <thead>
          <tr>
            <th>User</th>
            <th>Status</th>
            <th>Role</th>
            <th>Last login</th>
            <th>Latest location</th>
            <th aria-label="Open profile" />
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr
              aria-label={`Open profile for ${user.fullName}`}
              className="user-directory-row"
              key={user.id}
              onClick={() => openUser(user.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  openUser(user.id);
                }
              }}
              role="link"
              tabIndex={0}
            >
              <td className="table-primary-cell" data-label="User">
                <span className="user-directory-identity">
                  <span className="user-directory-avatar" aria-hidden="true">
                    {user.fullName
                      .split(/\s+/)
                      .slice(0, 2)
                      .map((part) => part[0]?.toUpperCase())
                      .join("")}
                  </span>
                  <span>
                    <strong>{user.fullName}</strong>
                    <span>{user.email}</span>
                  </span>
                </span>
              </td>
              <td data-label="Status">
                <span className={`ui-pill ${user.status === "approved" ? "ui-pill-success" : "ui-pill-warning"}`}>
                  {user.status === "approved" ? "Active" : "Pending"}
                </span>
              </td>
              <td data-label="Role">
                <span className={`ui-pill ${user.role === "admin" ? "ui-pill-info" : "ui-pill-ghost"}`}>
                  {user.role === "admin" ? "Administrator" : "Field staff"}
                </span>
              </td>
              <td data-label="Last login">
                {user.lastLoginAt ? (
                  <span title={formatDateTime(user.lastLoginAt)}>{formatRelativeTime(user.lastLoginAt)}</span>
                ) : (
                  <span className="muted">Not recorded</span>
                )}
              </td>
              <td data-label="Latest location">
                <span className="user-directory-location">
                  <strong>{user.locationLabel ?? user.region ?? "Not reported"}</strong>
                  <small>{user.locationLabel && user.region ? user.region : "GPS snapshot"}</small>
                </span>
              </td>
              <td className="user-directory-open" aria-hidden="true">
                <span>View</span>
                <svg viewBox="0 0 20 20">
                  <path d="m7.5 4 6 6-6 6" />
                </svg>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
