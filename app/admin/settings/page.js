"use client";

import { useState, useEffect } from "react";

const API_BASE_URL =
  "https://arscca-venue-scout-kevinvwongs-projects.vercel.app/api/v1/approved-venues";

const ROLE_OPTIONS = [
  { value: "organizer", label: "Organizer" },
  { value: "regional_coordinator", label: "Regional Coordinator" },
  { value: "admin", label: "Admin" },
];

function SectionHeading({ children }) {
  return (
    <p className="text-[10px] uppercase tracking-widest font-semibold text-ink-subtle mb-3">
      {children}
    </p>
  );
}

function CodeBlock({ children }) {
  return (
    <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 font-mono text-sm overflow-x-auto whitespace-pre-wrap">
      {children}
    </pre>
  );
}

export default function SettingsPage() {
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteForm, setInviteForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "organizer",
  });
  const [invitingUser, setInvitingUser] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [confirmDeactivate, setConfirmDeactivate] = useState(null); // user id pending confirm

  useEffect(() => {
    fetch("/api/admin/system/users")
      .then((r) => r.json())
      .then((data) => setUsers(data.users || []))
      .catch(() => {})
      .finally(() => setLoadingUsers(false));
  }, []);

  async function handleRoleChange(userId, newRole) {
    const res = await fetch(`/api/admin/system/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });
    if (res.ok) {
      const { user } = await res.json();
      setUsers((prev) => prev.map((u) => (u.id === userId ? user : u)));
    }
  }

  async function handleDeactivate(userId) {
    const res = await fetch(`/api/admin/system/users/${userId}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, is_active: false } : u))
      );
    }
    setConfirmDeactivate(null);
  }

  async function handleReactivate(userId) {
    const res = await fetch(`/api/admin/system/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: true }),
    });
    if (res.ok) {
      const { user } = await res.json();
      setUsers((prev) => prev.map((u) => (u.id === userId ? user : u)));
    }
  }

  async function handleInviteSubmit(e) {
    e.preventDefault();
    setInviteError("");
    setInvitingUser(true);
    try {
      const res = await fetch("/api/admin/system/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(inviteForm),
      });
      const data = await res.json();
      if (!res.ok) {
        setInviteError(data.error || "Failed to invite user.");
        return;
      }
      setUsers((prev) => [...prev, { ...data.user, is_active: true }]);
      setShowInviteForm(false);
      setInviteForm({ name: "", email: "", password: "", role: "organizer" });
    } catch {
      setInviteError("Network error. Please try again.");
    } finally {
      setInvitingUser(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-10">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Settings</h1>
        <p className="text-sm text-ink-muted">
          Team management, API integration, and external system configuration.
        </p>
      </div>

      {/* Team */}
      <section className="border border-gray-200 rounded-xl bg-white p-6 shadow-sm space-y-5">
        <SectionHeading>Team</SectionHeading>

        {loadingUsers ? (
          <div className="flex items-center gap-2 text-sm text-ink-muted">
            <div className="w-4 h-4 border-2 border-brand-200 border-t-brand-500 rounded-full animate-spin" />
            Loading users…
          </div>
        ) : users.length === 0 ? (
          <p className="text-sm text-ink-muted">No users found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-gray-200">
                  <th className="pb-2 pr-4 font-medium text-gray-700">Email</th>
                  <th className="pb-2 pr-4 font-medium text-gray-700">Name</th>
                  <th className="pb-2 pr-4 font-medium text-gray-700">Role</th>
                  <th className="pb-2 pr-4 font-medium text-gray-700">Status</th>
                  <th className="pb-2 font-medium text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map((user) => (
                  <tr key={user.id}>
                    <td className="py-3 pr-4 text-gray-800 break-all">{user.email}</td>
                    <td className="py-3 pr-4 text-gray-700">{user.name || <span className="text-ink-subtle">—</span>}</td>
                    <td className="py-3 pr-4">
                      <select
                        value={user.role}
                        onChange={(e) => handleRoleChange(user.id, e.target.value)}
                        className="input text-sm py-1 pr-6"
                      >
                        {ROLE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-3 pr-4">
                      {user.is_active ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="py-3">
                      {user.is_active ? (
                        confirmDeactivate === user.id ? (
                          <span className="flex items-center gap-2">
                            <span className="text-xs text-gray-600">Deactivate?</span>
                            <button
                              onClick={() => handleDeactivate(user.id)}
                              className="btn btn-danger-outline text-xs py-0.5 px-2"
                            >
                              Confirm
                            </button>
                            <button
                              onClick={() => setConfirmDeactivate(null)}
                              className="btn btn-outline text-xs py-0.5 px-2"
                            >
                              Cancel
                            </button>
                          </span>
                        ) : (
                          <button
                            onClick={() => setConfirmDeactivate(user.id)}
                            className="btn btn-danger-outline text-xs py-0.5 px-2"
                          >
                            Deactivate
                          </button>
                        )
                      ) : (
                        <button
                          onClick={() => handleReactivate(user.id)}
                          className="btn btn-outline text-xs py-0.5 px-2"
                        >
                          Reactivate
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!showInviteForm ? (
          <button
            onClick={() => {
              setShowInviteForm(true);
              setInviteError("");
            }}
            className="btn btn-primary text-sm"
          >
            Invite user
          </button>
        ) : (
          <form
            onSubmit={handleInviteSubmit}
            noValidate
            className="border border-gray-200 rounded-lg p-4 space-y-4 bg-gray-50"
          >
            <p className="text-sm font-medium text-gray-800">Invite a new user</p>

            {inviteError && (
              <div className="notice notice-error text-sm" role="alert">
                {inviteError}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label" htmlFor="invite-name">
                  Name
                </label>
                <input
                  id="invite-name"
                  type="text"
                  className="input"
                  value={inviteForm.name}
                  onChange={(e) =>
                    setInviteForm((f) => ({ ...f, name: e.target.value }))
                  }
                  placeholder="Jane Smith"
                />
              </div>
              <div>
                <label className="label" htmlFor="invite-email">
                  Email <span className="text-red-500">*</span>
                </label>
                <input
                  id="invite-email"
                  type="email"
                  className="input"
                  value={inviteForm.email}
                  onChange={(e) =>
                    setInviteForm((f) => ({ ...f, email: e.target.value }))
                  }
                  placeholder="jane@example.com"
                  required
                />
              </div>
              <div>
                <label className="label" htmlFor="invite-password">
                  Password <span className="text-red-500">*</span>
                </label>
                <input
                  id="invite-password"
                  type="password"
                  className="input"
                  value={inviteForm.password}
                  onChange={(e) =>
                    setInviteForm((f) => ({ ...f, password: e.target.value }))
                  }
                  placeholder="Min. 8 characters"
                  required
                />
              </div>
              <div>
                <label className="label" htmlFor="invite-role">
                  Role
                </label>
                <select
                  id="invite-role"
                  className="input"
                  value={inviteForm.role}
                  onChange={(e) =>
                    setInviteForm((f) => ({ ...f, role: e.target.value }))
                  }
                >
                  {ROLE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={invitingUser}
                className="btn btn-primary text-sm"
              >
                {invitingUser ? "Inviting…" : "Create user"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowInviteForm(false);
                  setInviteError("");
                }}
                className="btn btn-outline text-sm"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </section>

      {/* API Integration */}
      <section className="border border-gray-200 rounded-xl bg-white p-6 shadow-sm space-y-5">
        <SectionHeading>API Integration</SectionHeading>
        <p className="text-sm text-gray-700">
          Use this API to pull approved venues into external systems like arscca-VMS.
          Only venues with status <span className="font-mono text-xs bg-gray-100 rounded px-1">approved</span> are
          returned. Authentication uses a shared API key passed as a request header.
        </p>

        <div>
          <p className="label mb-1.5">API Endpoint</p>
          <CodeBlock>{API_BASE_URL}</CodeBlock>
        </div>

        <div>
          <p className="label mb-1.5">Authentication</p>
          <p className="text-sm text-ink-muted mb-2">
            Set <span className="font-mono text-xs bg-gray-100 rounded px-1">VENUESCOUT_API_KEY</span> in
            your Vercel project environment variables. The key is passed as a request header.
          </p>
          <CodeBlock>{`GET /api/v1/approved-venues
Header: x-api-key: YOUR_API_KEY
Optional: ?state=GA`}</CodeBlock>
        </div>

        <div>
          <p className="label mb-1.5">Example curl command</p>
          <CodeBlock>{`curl -H "x-api-key: YOUR_API_KEY" \\
  "${API_BASE_URL}?state=GA"`}</CodeBlock>
        </div>

        <div>
          <p className="label mb-1.5">Response shape</p>
          <CodeBlock>{`{
  "venues": [ { "id": 1, "name": "...", "composite_score": 82, ... } ],
  "count": 3,
  "generatedAt": "2026-05-05T12:00:00.000Z"
}`}</CodeBlock>
        </div>
      </section>

      {/* arscca-VMS Setup */}
      <section className="border border-gray-200 rounded-xl bg-white p-6 shadow-sm space-y-5">
        <SectionHeading>arscca-VMS Setup</SectionHeading>
        <p className="text-sm text-gray-700">
          Follow these steps to connect arscca-VMS to VenueScout so the event creation
          form can offer a "Select from approved venues" dropdown.
        </p>
        <ol className="space-y-4 text-sm text-gray-700 list-none">
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-brand-500 text-white text-xs font-bold flex items-center justify-center">
              1
            </span>
            <span>
              In the arscca-VMS Vercel project, add environment variable:
              <CodeBlock>{`VENUESCOUT_API_URL=${API_BASE_URL}`}</CodeBlock>
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-brand-500 text-white text-xs font-bold flex items-center justify-center">
              2
            </span>
            <span>
              Add environment variable:
              <CodeBlock>{`VENUESCOUT_API_KEY=your-shared-secret`}</CodeBlock>
              Use the same value set for <span className="font-mono text-xs bg-gray-100 rounded px-1">VENUESCOUT_API_KEY</span>{" "}
              in this VenueScout project.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-brand-500 text-white text-xs font-bold flex items-center justify-center">
              3
            </span>
            <span>
              The event creation form in arscca-VMS will show a "Select from approved venues"
              dropdown, pre-populated with venues returned by this API.
            </span>
          </li>
        </ol>
      </section>

      {/* Export Formats */}
      <section className="border border-gray-200 rounded-xl bg-white p-6 shadow-sm space-y-4">
        <SectionHeading>Export Formats</SectionHeading>
        <p className="text-sm text-gray-700">
          Download a full snapshot of the approved venue library for offline use or import into
          other tools.
        </p>
        <div>
          <a
            href="/api/admin/library?export=1"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-outline text-sm inline-flex items-center gap-1.5"
          >
            Export all approved venues (JSON) ↗
          </a>
          <p className="text-xs text-ink-subtle mt-1.5">
            Admin access required. Opens the raw JSON export in a new tab.
          </p>
        </div>
      </section>
    </div>
  );
}
