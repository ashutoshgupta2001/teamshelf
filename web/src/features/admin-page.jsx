import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ShieldCheck, X } from "lucide-react";
import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import { CopyButton, ErrorNotice, Spinner } from "../components/ui.jsx";
import { adminClient, authClient } from "../lib/api.js";

export function AdminPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("users");
  const [email, setEmail] = useState("");
  const [activeInvitation, setActiveInvitation] = useState(null);
  const session = useQuery({
    queryKey: ["session"],
    queryFn: authClient.session,
    retry: false,
  });
  const isAdmin = session.data?.user.platformRole === "ADMIN";
  const users = useQuery({
    queryKey: ["admin", "users"],
    queryFn: adminClient.users,
    enabled: isAdmin,
  });
  const invitations = useQuery({
    queryKey: ["admin", "invitations"],
    queryFn: adminClient.invitations,
    enabled: isAdmin,
  });
  const updateRole = useMutation({
    mutationFn: ({ userId, role }) => adminClient.updateRole(userId, role),
    onSuccess: (updated) => {
      queryClient.setQueryData(["admin", "users"], (current = []) =>
        current.map((user) => (user.id === updated.id ? updated : user)),
      );
      if (updated.id === session.data.user.id) {
        queryClient.setQueryData(["session"], (current) => ({
          ...current,
          user: { ...current.user, platformRole: updated.platformRole },
        }));
        if (updated.platformRole !== "ADMIN")
          navigate("/workspaces", { replace: true });
      }
    },
  });
  const invite = useMutation({
    mutationFn: () => adminClient.invite(email),
    onSuccess: (created) => {
      setEmail("");
      setActiveInvitation(created);
      queryClient.setQueryData(["admin", "invitations"], (current = []) => [
        created,
        ...current.filter((invitation) => invitation.id !== created.id),
      ]);
      queryClient.invalidateQueries({ queryKey: ["admin", "invitations"] });
    },
  });
  const resend = useMutation({
    mutationFn: adminClient.resendInvitation,
    onSuccess: (updated) => {
      setActiveInvitation(updated);
      queryClient.invalidateQueries({ queryKey: ["admin", "invitations"] });
    },
  });
  const revoke = useMutation({
    mutationFn: adminClient.revokeInvitation,
    onSuccess: (_, invitationId) => {
      if (activeInvitation?.id === invitationId) setActiveInvitation(null);
      queryClient.invalidateQueries({ queryKey: ["admin", "invitations"] });
    },
  });
  const pendingInvitations =
    invitations.data?.filter(
      (invitation) => !invitation.acceptedAt && !invitation.revokedAt,
    ) || [];

  if (session.isLoading)
    return (
      <main className="center-page">
        <Spinner label="Opening administration…" />
      </main>
    );
  if (!isAdmin) return <Navigate to="/workspaces" replace />;

  return (
    <div className="workspace-select admin-page">
      <header>
        <Link className="brand" to="/workspaces">
          TeamShelf
        </Link>
        <Link className="button ghost" to="/workspaces">
          <ArrowLeft size={17} /> Back to workspaces
        </Link>
      </header>
      <main>
        <div className="page-heading admin-heading">
          <div>
            <span className="eyebrow ink">Platform administration</span>
            <h1>Users & access</h1>
            <p className="muted">
              Invite TeamShelf users and manage platform administrators.
            </p>
          </div>
          <span className="admin-mark" aria-hidden="true">
            <ShieldCheck size={28} />
          </span>
        </div>

        <div className="people-tabs" role="tablist" aria-label="Administration">
          <button
            type="button"
            role="tab"
            id="platform-users-tab"
            aria-controls="platform-users-panel"
            aria-selected={activeTab === "users"}
            onClick={() => setActiveTab("users")}
          >
            Users <span>{users.data?.length || 0}</span>
          </button>
          <button
            type="button"
            role="tab"
            id="platform-invitations-tab"
            aria-controls="platform-invitations-panel"
            aria-selected={activeTab === "invitations"}
            onClick={() => setActiveTab("invitations")}
          >
            Invitations <span>{pendingInvitations.length}</span>
          </button>
        </div>

        {activeTab === "users" && (
          <section
            className="settings-card people-panel"
            role="tabpanel"
            id="platform-users-panel"
            aria-labelledby="platform-users-tab"
          >
            <h2>Platform users</h2>
            <p className="muted section-description">
              Platform administrators can access this console. Workspace access
              is managed separately by each workspace owner.
            </p>
            {users.isLoading ? (
              <Spinner />
            ) : users.error ? (
              <ErrorNotice error={users.error} />
            ) : (
              users.data.map((user) => (
                <div className="person-row" key={user.id}>
                  <span className="avatar">
                    {user.displayName.slice(0, 1).toUpperCase()}
                  </span>
                  <div>
                    <strong>
                      {user.displayName}
                      {user.id === session.data.user.id ? " (you)" : ""}
                    </strong>
                    <span>{user.email}</span>
                  </div>
                  <span
                    className={`role-label${user.platformRole === "ADMIN" ? " admin" : ""}`}
                  >
                    {user.platformRole === "ADMIN" ? "Admin" : "User"}
                  </span>
                  <button
                    type="button"
                    className="button ghost"
                    disabled={
                      updateRole.isPending &&
                      updateRole.variables?.userId === user.id
                    }
                    onClick={() => {
                      const role =
                        user.platformRole === "ADMIN" ? "USER" : "ADMIN";
                      if (
                        role === "ADMIN" ||
                        confirm(
                          `Remove administrator access from ${user.displayName}?`,
                        )
                      )
                        updateRole.mutate({ userId: user.id, role });
                    }}
                  >
                    {user.platformRole === "ADMIN"
                      ? "Remove admin"
                      : "Make admin"}
                  </button>
                </div>
              ))
            )}
            {updateRole.error && <ErrorNotice error={updateRole.error} />}
          </section>
        )}

        {activeTab === "invitations" && (
          <div
            role="tabpanel"
            id="platform-invitations-panel"
            aria-labelledby="platform-invitations-tab"
          >
            <section className="settings-card people-panel">
              <h2>Invite a platform user</h2>
              <p className="muted section-description">
                New accounts start as users. Promote them from the Users tab
                after they accept the invitation.
              </p>
              <form
                className="inline-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  invite.mutate();
                }}
              >
                <label className="field">
                  <span>Email address</span>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="colleague@company.com"
                  />
                </label>
                <button className="button primary" disabled={invite.isPending}>
                  {invite.isPending ? "Sending…" : "Send invitation"}
                </button>
              </form>
              {invite.error && <ErrorNotice error={invite.error} />}
            </section>

            <section className="settings-card people-panel">
              <h2>Pending platform invitations</h2>
              {invitations.isLoading ? (
                <Spinner />
              ) : invitations.error ? (
                <ErrorNotice error={invitations.error} />
              ) : pendingInvitations.length === 0 ? (
                <p className="muted empty-list">No pending invitations.</p>
              ) : (
                pendingInvitations.map((invitation) => {
                  const invitationUrl =
                    activeInvitation?.id === invitation.id
                      ? activeInvitation.url
                      : invitation.url;
                  return (
                    <div
                      className="person-row invitation-row"
                      key={invitation.id}
                    >
                      <span className="avatar pending">@</span>
                      <div className="invitation-details">
                        <strong>{invitation.email}</strong>
                        <span>
                          Expires{" "}
                          {new Date(invitation.expiresAt).toLocaleDateString()}
                        </span>
                        {invitationUrl && (
                          <div className="copy-row invitation-copy">
                            <input
                              readOnly
                              aria-label={`Invitation link for ${invitation.email}`}
                              value={invitationUrl}
                            />
                            <CopyButton
                              key={invitationUrl}
                              value={invitationUrl}
                            />
                          </div>
                        )}
                      </div>
                      <div className="invitation-actions">
                        <button
                          type="button"
                          className="button ghost"
                          disabled={
                            resend.isPending &&
                            resend.variables === invitation.id
                          }
                          onClick={() => resend.mutate(invitation.id)}
                        >
                          {resend.isPending &&
                          resend.variables === invitation.id
                            ? "Sending…"
                            : "Resend"}
                        </button>
                        <button
                          type="button"
                          className="icon-button danger"
                          aria-label={`Revoke invitation for ${invitation.email}`}
                          onClick={() => revoke.mutate(invitation.id)}
                        >
                          <X size={17} />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
              {resend.error && <ErrorNotice error={resend.error} />}
              {revoke.error && <ErrorNotice error={revoke.error} />}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
