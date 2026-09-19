let csrfToken = null;
export function setCsrfToken(value) {
  csrfToken = value;
}

export class ApiError extends Error {
  constructor(payload, status) {
    super(payload?.message || "Something went wrong");
    this.code = payload?.code;
    this.status = status;
    this.details = payload?.details || [];
  }
}

export async function apiRequest(path, options = {}) {
  const headers = {
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...options.headers,
  };
  if (csrfToken && !["GET", "HEAD"].includes(options.method || "GET"))
    headers["X-CSRF-Token"] = csrfToken;
  const response = await fetch(`/api/v1${path}`, {
    credentials: "include",
    ...options,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (response.status === 204) return null;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(payload.error, response.status);
  return payload.data;
}

export const authClient = {
  session: async () => {
    const data = await apiRequest("/auth/session");
    setCsrfToken(data.csrfToken);
    return data;
  },
  login: async (body) => {
    const data = await apiRequest("/auth/password/login", {
      method: "POST",
      body,
    });
    setCsrfToken(data.csrfToken);
    return data;
  },
  google: async (credential, invitationToken) => {
    const data = await apiRequest("/auth/google", {
      method: "POST",
      body: { credential, ...(invitationToken ? { invitationToken } : {}) },
    });
    setCsrfToken(data.csrfToken);
    return data;
  },
  logout: () => apiRequest("/auth/logout", { method: "POST" }),
  forgot: (email) =>
    apiRequest("/auth/password/forgot", { method: "POST", body: { email } }),
  reset: (token, password) =>
    apiRequest("/auth/password/reset", {
      method: "POST",
      body: { token, password },
    }),
};
export const invitationClient = {
  status: (token) =>
    apiRequest(`/invitations/${encodeURIComponent(token)}/status`),
  acceptPassword: async (token, body) => {
    const data = await apiRequest(
      `/invitations/${encodeURIComponent(token)}/accept/password`,
      { method: "POST", body },
    );
    setCsrfToken(data.csrfToken);
    return data;
  },
  list: (workspaceId) => apiRequest(`/workspaces/${workspaceId}/invitations`),
  create: (workspaceId, email) =>
    apiRequest(`/workspaces/${workspaceId}/invitations`, {
      method: "POST",
      body: { email },
    }),
  resend: (workspaceId, id) =>
    apiRequest(`/workspaces/${workspaceId}/invitations/${id}/resend`, {
      method: "POST",
    }),
  revoke: (workspaceId, id) =>
    apiRequest(`/workspaces/${workspaceId}/invitations/${id}`, {
      method: "DELETE",
    }),
};
export const adminClient = {
  users: () => apiRequest("/admin/users"),
  updateRole: (userId, platformRole) =>
    apiRequest(`/admin/users/${userId}/role`, {
      method: "PATCH",
      body: { platformRole },
    }),
  invitations: () => apiRequest("/admin/invitations"),
  invite: (email) =>
    apiRequest("/admin/invitations", {
      method: "POST",
      body: { email },
    }),
  resendInvitation: (id) =>
    apiRequest(`/admin/invitations/${id}/resend`, { method: "POST" }),
  revokeInvitation: (id) =>
    apiRequest(`/admin/invitations/${id}`, { method: "DELETE" }),
};
export const workspaceClient = {
  list: () => apiRequest("/workspaces"),
  create: (name) =>
    apiRequest("/workspaces", { method: "POST", body: { name } }),
  get: (id) => apiRequest(`/workspaces/${id}`),
  rename: (id, name) =>
    apiRequest(`/workspaces/${id}`, { method: "PATCH", body: { name } }),
  members: (id) => apiRequest(`/workspaces/${id}/members`),
  removeMember: (id, userId) =>
    apiRequest(`/workspaces/${id}/members/${userId}`, { method: "DELETE" }),
  transfer: (id, userId) =>
    apiRequest(`/workspaces/${id}/transfer-ownership`, {
      method: "POST",
      body: { userId },
    }),
  scheduleDeletion: (id) =>
    apiRequest(`/workspaces/${id}/schedule-deletion`, { method: "POST" }),
  cancelDeletion: (id) =>
    apiRequest(`/workspaces/${id}/cancel-deletion`, { method: "POST" }),
};
export const itemClient = {
  list: (w, p) => apiRequest(`/workspaces/${w}/items/${p}`),
  folder: (w, parentItemId, name) =>
    apiRequest(`/workspaces/${w}/folders`, {
      method: "POST",
      body: { parentItemId, name },
    }),
  rename: (w, item, name) =>
    apiRequest(`/workspaces/${w}/items/${item.id}`, {
      method: "PATCH",
      body: { name, lockVersion: item.lockVersion },
    }),
  move: (w, item, parentItemId) =>
    apiRequest(`/workspaces/${w}/items/${item.id}/move`, {
      method: "POST",
      body: { parentItemId, lockVersion: item.lockVersion },
    }),
  remove: (w, id) =>
    apiRequest(`/workspaces/${w}/items/${id}`, { method: "DELETE" }),
  trash: (w) => apiRequest(`/workspaces/${w}/trash`),
  restore: (w, id) =>
    apiRequest(`/workspaces/${w}/trash/${id}/restore`, { method: "POST" }),
};
export const documentClient = {
  upload: async (workspaceId, parentItemId, file, onProgress) => {
    const created = await apiRequest(`/workspaces/${workspaceId}/uploads`, {
      method: "POST",
      body: {
        parentItemId,
        filename: file.name,
        sizeBytes: file.size,
        contentType: file.type || "application/octet-stream",
      },
    });
    await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open(created.authorization.method, created.authorization.url);
      Object.entries(created.authorization.headers).forEach(([k, v]) =>
        xhr.setRequestHeader(k, v),
      );
      xhr.upload.onprogress = (e) =>
        onProgress?.(e.lengthComputable ? e.loaded / e.total : 0);
      xhr.onload = () =>
        xhr.status >= 200 && xhr.status < 300
          ? resolve()
          : reject(new Error("File transfer failed"));
      xhr.onerror = reject;
      xhr.send(file);
    });
    return apiRequest(
      `/workspaces/${workspaceId}/uploads/${created.upload.id}/complete`,
      { method: "POST" },
    );
  },
  download: async (w, id) => {
    const auth = await apiRequest(`/workspaces/${w}/documents/${id}/download`);
    window.location.assign(auth.url);
  },
  shares: (w, d) => apiRequest(`/workspaces/${w}/documents/${d}/share-links`),
  share: (w, d, body) =>
    apiRequest(`/workspaces/${w}/documents/${d}/share-links`, {
      method: "POST",
      body,
    }),
  revokeShare: (w, id) =>
    apiRequest(`/workspaces/${w}/share-links/${id}`, { method: "DELETE" }),
  publicMetadata: (token) =>
    apiRequest(`/public/shares/${encodeURIComponent(token)}`),
  publicContent: (token) =>
    apiRequest(`/public/shares/${encodeURIComponent(token)}/content`),
};
