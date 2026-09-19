import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArchiveRestore,
  ArrowLeft,
  ChevronRight,
  Download,
  File,
  FileImage,
  FileText,
  Folder,
  FolderInput,
  FolderPlus,
  Link2,
  LogOut,
  MoreHorizontal,
  Plus,
  Settings,
  ShieldCheck,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react";
import { useRef, useState } from "react";
import {
  Link,
  Navigate,
  NavLink,
  Outlet,
  useNavigate,
  useParams,
} from "react-router";
import {
  authClient,
  documentClient,
  invitationClient,
  itemClient,
  workspaceClient,
} from "../lib/api.js";
import {
  CopyButton,
  Empty,
  ErrorNotice,
  Modal,
  Spinner,
  Status,
} from "../components/ui.jsx";

export function ProtectedRoute() {
  const session = useQuery({
    queryKey: ["session"],
    queryFn: authClient.session,
    retry: false,
  });
  if (session.isLoading)
    return (
      <main className="center-page">
        <Spinner label="Opening your shelf…" />
      </main>
    );
  if (session.error?.status === 401) return <Navigate to="/login" replace />;
  if (session.error)
    return (
      <main className="center-page">
        <div className="form-card compact">
          <h1>Unable to open TeamShelf</h1>
          <ErrorNotice error={session.error} />
          <button className="button primary" onClick={() => session.refetch()}>
            Try again
          </button>
        </div>
      </main>
    );
  return <Outlet />;
}

export function WorkspacesPage() {
  const navigate = useNavigate(),
    queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const session = useQuery({
    queryKey: ["session"],
    queryFn: authClient.session,
  });
  const workspaces = useQuery({
    queryKey: ["workspaces"],
    queryFn: workspaceClient.list,
  });
  const create = useMutation({
    mutationFn: workspaceClient.create,
    onSuccess: (w) => {
      queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      navigate(`/workspaces/${w.id}`);
    },
  });
  const logout = useMutation({
    mutationFn: authClient.logout,
    onSuccess: () => navigate("/login"),
  });
  return (
    <div className="workspace-select">
      <header>
        <Link className="brand" to="/workspaces">
          TeamShelf
        </Link>
        <div className="header-actions">
          {session.data?.user.platformRole === "ADMIN" && (
            <Link className="button secondary" to="/admin">
              <ShieldCheck size={17} /> Administration
            </Link>
          )}
          <button className="button ghost" onClick={() => logout.mutate()}>
            <LogOut size={17} /> Sign out
          </button>
        </div>
      </header>
      <main>
        <div className="page-heading">
          <div>
            <span className="eyebrow ink">Your workspace</span>
            <h1>Where are we working?</h1>
            <p className="muted">
              Pick up where your team left off, or create a fresh shelf.
            </p>
          </div>
          <button className="button primary" onClick={() => setOpen(true)}>
            <Plus size={18} /> New workspace
          </button>
        </div>
        {workspaces.isLoading ? (
          <Spinner />
        ) : workspaces.error ? (
          <ErrorNotice error={workspaces.error} />
        ) : workspaces.data.length === 0 ? (
          <Empty
            title="Your first shelf is waiting"
            detail="Create a workspace to start organizing your team's documents."
            action={
              <button className="button primary" onClick={() => setOpen(true)}>
                Create workspace
              </button>
            }
          />
        ) : (
          <div className="workspace-grid">
            {workspaces.data.map((w) => (
              <Link
                key={w.id}
                to={`/workspaces/${w.id}`}
                className="workspace-card"
              >
                <span className="workspace-monogram">
                  {w.name.slice(0, 2).toUpperCase()}
                </span>
                <div>
                  <h2>{w.name}</h2>
                  <p>
                    {w.status === "ACTIVE"
                      ? "Open workspace"
                      : "Deletion scheduled"}
                  </p>
                </div>
                <ChevronRight />
              </Link>
            ))}
          </div>
        )}
      </main>
      <Modal
        title="Create a workspace"
        open={open}
        onClose={() => setOpen(false)}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate(name);
          }}
        >
          <label className="field">
            <span>Workspace name</span>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength="255"
              required
            />
          </label>
          {create.error && <ErrorNotice error={create.error} />}
          <div className="modal-actions">
            <button
              type="button"
              className="button ghost"
              onClick={() => setOpen(false)}
            >
              Cancel
            </button>
            <button className="button primary" disabled={create.isPending}>
              {create.isPending ? "Creating…" : "Create workspace"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export function WorkspaceLayout() {
  const { workspaceId } = useParams();
  const navigate = useNavigate();
  const workspace = useQuery({
    queryKey: ["workspace", workspaceId],
    queryFn: () => workspaceClient.get(workspaceId),
  });
  const logout = useMutation({
    mutationFn: authClient.logout,
    onSuccess: () => navigate("/login"),
  });
  if (workspace.isLoading)
    return (
      <main className="center-page">
        <Spinner />
      </main>
    );
  if (workspace.error)
    return (
      <main className="center-page">
        <ErrorNotice error={workspace.error} />
      </main>
    );
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" to="/workspaces">
          TeamShelf
        </Link>
        <Link className="workspace-switcher" to="/workspaces">
          <span className="workspace-monogram small">
            {workspace.data.name.slice(0, 2).toUpperCase()}
          </span>
          <span>
            <small>Workspace</small>
            <strong>{workspace.data.name}</strong>
          </span>
          <ChevronRight size={16} />
        </Link>
        <nav aria-label="Workspace">
          <NavLink end to={`/workspaces/${workspaceId}`}>
            <Folder size={18} /> Documents
          </NavLink>
          <NavLink to={`/workspaces/${workspaceId}/members`}>
            <Users size={18} /> People
          </NavLink>
          <NavLink to={`/workspaces/${workspaceId}/trash`}>
            <Trash2 size={18} /> Trash
          </NavLink>
          <NavLink to={`/workspaces/${workspaceId}/settings`}>
            <Settings size={18} /> Settings
          </NavLink>
        </nav>
        <div className="sidebar-bottom">
          <button onClick={() => logout.mutate()}>
            <LogOut size={17} /> Sign out
          </button>
        </div>
      </aside>
      <section className="main-panel">
        <Outlet context={{ workspace: workspace.data }} />
      </section>
    </div>
  );
}

function FileIcon({ item }) {
  if (item.type === "FOLDER")
    return (
      <span className="file-icon folder">
        <Folder />
      </span>
    );
  if (item.document?.contentType?.startsWith("image/"))
    return (
      <span className="file-icon image">
        <FileImage />
      </span>
    );
  if (item.document?.contentType === "application/pdf")
    return (
      <span className="file-icon pdf">
        <FileText />
      </span>
    );
  return (
    <span className="file-icon document">
      <File />
    </span>
  );
}

export function BrowserPage() {
  const { workspaceId, itemId } = useParams();
  const workspace = useQuery({
    queryKey: ["workspace", workspaceId],
    queryFn: () => workspaceClient.get(workspaceId),
  });
  const parentId = itemId || workspace.data?.rootItemId;
  const queryClient = useQueryClient();
  const items = useQuery({
    queryKey: ["items", workspaceId, parentId],
    queryFn: () => itemClient.list(workspaceId, parentId),
    enabled: Boolean(parentId),
    refetchInterval: (q) =>
      q.state.data?.some((i) => i.document?.status === "SCANNING")
        ? 3000
        : false,
  });
  const [folderOpen, setFolderOpen] = useState(false),
    [folderName, setFolderName] = useState("");
  const [selected, setSelected] = useState(null),
    [renameOpen, setRenameOpen] = useState(false),
    [moveOpen, setMoveOpen] = useState(false),
    [shareOpen, setShareOpen] = useState(false),
    [uploadProgress, setUploadProgress] = useState(null);
  const fileRef = useRef();
  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: ["items", workspaceId, parentId],
    });
  const folder = useMutation({
    mutationFn: () => itemClient.folder(workspaceId, parentId, folderName),
    onSuccess: () => {
      refresh();
      setFolderOpen(false);
      setFolderName("");
    },
  });
  const rename = useMutation({
    mutationFn: (name) => itemClient.rename(workspaceId, selected, name),
    onSuccess: () => {
      refresh();
      setRenameOpen(false);
    },
  });
  const remove = useMutation({
    mutationFn: (id) => itemClient.remove(workspaceId, id),
    onSuccess: refresh,
  });
  const upload = useMutation({
    mutationFn: (file) =>
      documentClient.upload(workspaceId, parentId, file, setUploadProgress),
    onSuccess: () => {
      setUploadProgress(null);
      refresh();
    },
    onError: () => setUploadProgress(null),
  });
  const openItem = (item) =>
    item.type === "FOLDER"
      ? `/workspaces/${workspaceId}/folders/${item.id}`
      : null;
  return (
    <>
      <header className="content-header">
        <div className="breadcrumbs">
          <Link to="/workspaces">Workspaces</Link>
          <ChevronRight size={14} />
          <Link to={`/workspaces/${workspaceId}`}>
            {workspace.data?.name || "Workspace"}
          </Link>
          {itemId && (
            <>
              <ChevronRight size={14} />
              <span>Folder</span>
            </>
          )}
        </div>
        <div className="header-actions">
          <button
            className="button secondary"
            onClick={() => setFolderOpen(true)}
          >
            <FolderPlus size={17} /> New folder
          </button>
          <button
            className="button primary"
            onClick={() => fileRef.current.click()}
          >
            <Upload size={17} /> Upload
          </button>
          <input
            ref={fileRef}
            hidden
            type="file"
            onChange={(e) =>
              e.target.files[0] && upload.mutate(e.target.files[0])
            }
          />
        </div>
      </header>
      <main className="content">
        <div className="title-row">
          <div>
            {itemId && (
              <Link className="back-link" to={`/workspaces/${workspaceId}`}>
                <ArrowLeft size={16} /> Workspace root
              </Link>
            )}
            <h1>{itemId ? "Folder" : "All documents"}</h1>
            <p className="muted">
              {items.data?.length || 0} items · everyone in this workspace can
              view these files
            </p>
          </div>
          <div className="view-toggle" aria-label="View style">
            <button className="active">List</button>
          </div>
        </div>
        {upload.isPending && (
          <div className="upload-strip">
            <span>Uploading document</span>
            <div>
              <i
                style={{ width: `${Math.round((uploadProgress || 0) * 100)}%` }}
              />
            </div>
            <strong>{Math.round((uploadProgress || 0) * 100)}%</strong>
          </div>
        )}
        {upload.error && <ErrorNotice error={upload.error} />}{" "}
        {items.isLoading ? (
          <Spinner />
        ) : items.error ? (
          <ErrorNotice error={items.error} />
        ) : items.data.length === 0 ? (
          <Empty
            title="Nothing on this shelf yet"
            detail="Upload a document or add a folder to begin."
          />
        ) : (
          <div className="item-table" role="table" aria-label="Documents">
            <div className="item-row table-head" role="row">
              <span>Name</span>
              <span>Type</span>
              <span>Status</span>
              <span>Actions</span>
            </div>
            {items.data.map((item) => (
              <div className="item-row" role="row" key={item.id}>
                <div className="item-name">
                  {openItem(item) ? (
                    <Link to={openItem(item)}>
                      <FileIcon item={item} />
                      <strong>{item.name}</strong>
                    </Link>
                  ) : (
                    <>
                      <FileIcon item={item} />
                      <strong>{item.name}</strong>
                    </>
                  )}
                </div>
                <span className="muted">
                  {item.type === "FOLDER"
                    ? "Folder"
                    : item.document?.contentType
                        ?.split("/")
                        .pop()
                        ?.toUpperCase()}
                </span>
                <span>
                  {item.document ? (
                    <Status value={item.document.status} />
                  ) : (
                    <span className="muted">—</span>
                  )}
                </span>
                <div className="row-actions">
                  {item.document?.status === "AVAILABLE" && (
                    <>
                      <button
                        className="icon-button"
                        title="Download"
                        onClick={() =>
                          documentClient.download(workspaceId, item.document.id)
                        }
                      >
                        <Download size={17} />
                      </button>
                      <button
                        className="icon-button"
                        title="Share"
                        onClick={() => {
                          setSelected(item);
                          setShareOpen(true);
                        }}
                      >
                        <Link2 size={17} />
                      </button>
                    </>
                  )}
                  <button
                    className="icon-button"
                    title="Rename"
                    onClick={() => {
                      setSelected(item);
                      setRenameOpen(true);
                    }}
                  >
                    <MoreHorizontal size={18} />
                  </button>
                  <button
                    className="icon-button"
                    title="Move"
                    onClick={() => {
                      setSelected(item);
                      setMoveOpen(true);
                    }}
                  >
                    <FolderInput size={17} />
                  </button>
                  <button
                    className="icon-button danger"
                    title="Move to trash"
                    onClick={() =>
                      confirm(`Move “${item.name}” to trash?`) &&
                      remove.mutate(item.id)
                    }
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
      <Modal
        title="New folder"
        open={folderOpen}
        onClose={() => setFolderOpen(false)}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            folder.mutate();
          }}
        >
          <label className="field">
            <span>Folder name</span>
            <input
              autoFocus
              required
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
            />
          </label>
          {folder.error && <ErrorNotice error={folder.error} />}
          <div className="modal-actions">
            <button
              type="button"
              className="button ghost"
              onClick={() => setFolderOpen(false)}
            >
              Cancel
            </button>
            <button className="button primary">Create folder</button>
          </div>
        </form>
      </Modal>
      <RenameModal
        item={selected}
        open={renameOpen}
        onClose={() => setRenameOpen(false)}
        mutation={rename}
      />
      <MoveModal
        workspaceId={workspaceId}
        rootItemId={workspace.data?.rootItemId}
        item={selected}
        open={moveOpen}
        onClose={() => setMoveOpen(false)}
        onMoved={refresh}
      />
      <ShareModal
        workspaceId={workspaceId}
        item={selected}
        open={shareOpen}
        onClose={() => setShareOpen(false)}
      />
    </>
  );
}

function RenameModal({ item, open, onClose, mutation }) {
  const [name, setName] = useState("");
  return (
    <Modal title="Rename item" open={open} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate(name || item.name);
        }}
      >
        <label className="field">
          <span>New name</span>
          <input
            autoFocus
            value={name}
            placeholder={item?.name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        {mutation.error && <ErrorNotice error={mutation.error} />}
        <div className="modal-actions">
          <button type="button" className="button ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary">Save name</button>
        </div>
      </form>
    </Modal>
  );
}
async function loadFolderTree(workspaceId, rootItemId, excludedItemId) {
  const folders = [];
  const queue = [rootItemId];
  while (queue.length) {
    const children = await itemClient.list(workspaceId, queue.shift());
    for (const child of children) {
      if (child.type !== "FOLDER" || child.id === excludedItemId) continue;
      folders.push(child);
      queue.push(child.id);
    }
  }
  return folders;
}
function MoveModal({ workspaceId, rootItemId, item, open, onClose, onMoved }) {
  const [destination, setDestination] = useState("");
  const folders = useQuery({
    queryKey: ["move-folders", workspaceId, rootItemId, item?.id],
    queryFn: () => loadFolderTree(workspaceId, rootItemId, item?.id),
    enabled: open && Boolean(rootItemId),
  });
  const move = useMutation({
    mutationFn: () => itemClient.move(workspaceId, item, destination),
    onSuccess: () => {
      onMoved();
      setDestination("");
      onClose();
    },
  });
  const choices = folders.data || [];
  return (
    <Modal title="Move item" open={open} onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          move.mutate();
        }}
      >
        <label className="field">
          <span>Destination</span>
          <select
            value={destination}
            onChange={(event) => setDestination(event.target.value)}
            required
          >
            <option value="">Choose a folder</option>
            <option value={rootItemId}>Workspace root</option>
            {choices.map((folder) => (
              <option value={folder.id} key={folder.id}>
                {folder.name}
              </option>
            ))}
          </select>
        </label>
        {move.error && <ErrorNotice error={move.error} />}
        <div className="modal-actions">
          <button type="button" className="button ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" disabled={!destination}>
            Move item
          </button>
        </div>
      </form>
    </Modal>
  );
}
function ShareModal({ workspaceId, item, open, onClose }) {
  const queryClient = useQueryClient();
  const [created, setCreated] = useState(null);
  const shares = useQuery({
    queryKey: ["shares", workspaceId, item?.document?.id],
    queryFn: () => documentClient.shares(workspaceId, item.document.id),
    enabled: open && Boolean(item?.document?.id),
  });
  const create = useMutation({
    mutationFn: () =>
      documentClient.share(workspaceId, item.document.id, {
        allowDownload: true,
        expiresInDays: 7,
      }),
    onSuccess: (share) => {
      setCreated(share);
      queryClient.invalidateQueries({
        queryKey: ["shares", workspaceId, item.document.id],
      });
    },
  });
  const revoke = useMutation({
    mutationFn: (shareId) => documentClient.revokeShare(workspaceId, shareId),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["shares", workspaceId, item.document.id],
      }),
  });
  return (
    <Modal
      title="Share document"
      open={open}
      onClose={() => {
        setCreated(null);
        onClose();
      }}
    >
      <div>
        <div className="share-preview">
          <FileText />
          <div>
            <strong>{item?.name}</strong>
            <span>Available to link visitors only</span>
          </div>
        </div>
        {created ? (
          <>
            <p className="muted">
              This link expires in 7 days. Anyone with it can open this
              document.
            </p>
            <div className="copy-row">
              <input readOnly value={created.url} />
              <CopyButton key={created.url} value={created.url} />
            </div>
          </>
        ) : (
          <>
            <p className="muted">
              The link will not reveal your workspace or any other documents.
            </p>
            {create.error && <ErrorNotice error={create.error} />}
            <div className="modal-actions">
              <button className="button ghost" onClick={onClose}>
                Cancel
              </button>
              <button
                className="button primary"
                onClick={() => create.mutate()}
              >
                Create 7-day link
              </button>
            </div>
          </>
        )}
        {shares.data?.length > 0 && (
          <div className="share-list">
            <h3>Previous links</h3>
            {shares.data.map((share) => (
              <div key={share.id}>
                <span>
                  {share.revokedAt
                    ? "Revoked"
                    : `Expires ${new Date(share.expiresAt).toLocaleDateString()}`}
                </span>
                {!share.revokedAt && (
                  <button
                    className="button ghost"
                    onClick={() => revoke.mutate(share.id)}
                  >
                    Revoke
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

export function TrashPage() {
  const { workspaceId } = useParams();
  const qc = useQueryClient();
  const trash = useQuery({
    queryKey: ["trash", workspaceId],
    queryFn: () => itemClient.trash(workspaceId),
  });
  const restore = useMutation({
    mutationFn: (id) => itemClient.restore(workspaceId, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["trash", workspaceId] }),
  });
  return (
    <>
      <SimpleHeader title="Trash" />
      <main className="content">
        <div className="title-row">
          <div>
            <h1>Recently deleted</h1>
            <p className="muted">Items remain here for up to 30 days.</p>
          </div>
        </div>
        {trash.isLoading ? (
          <Spinner />
        ) : trash.error ? (
          <ErrorNotice error={trash.error} />
        ) : trash.data.length === 0 ? (
          <Empty
            title="Trash is empty"
            detail="Deleted files and folders will appear here."
          />
        ) : (
          <div className="item-table">
            {trash.data.map((item) => (
              <div className="item-row trash-row" key={item.id}>
                <div className="item-name">
                  <FileIcon item={item} />
                  <div>
                    <strong>{item.name}</strong>
                    <small>
                      Deleted {new Date(item.deletedAt).toLocaleDateString()}
                    </small>
                  </div>
                </div>
                <button
                  className="button secondary"
                  onClick={() => restore.mutate(item.id)}
                >
                  <ArchiveRestore size={16} /> Restore
                </button>
              </div>
            ))}
          </div>
        )}
      </main>
    </>
  );
}

export function MembersPage() {
  const { workspaceId } = useParams();
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [activeTab, setActiveTab] = useState("users");
  const [activeInvitation, setActiveInvitation] = useState(null);
  const session = useQuery({
    queryKey: ["session"],
    queryFn: authClient.session,
  });
  const workspace = useQuery({
    queryKey: ["workspace", workspaceId],
    queryFn: () => workspaceClient.get(workspaceId),
  });
  const members = useQuery({
    queryKey: ["members", workspaceId],
    queryFn: () => workspaceClient.members(workspaceId),
  });
  const canManage = workspace.data?.ownerUserId === session.data?.user.id;
  const invitations = useQuery({
    queryKey: ["invitations", workspaceId],
    queryFn: () => invitationClient.list(workspaceId),
    enabled: canManage === true,
    retry: false,
  });
  const invite = useMutation({
    mutationFn: () => invitationClient.create(workspaceId, email),
    onSuccess: (created) => {
      setEmail("");
      setActiveInvitation(created);
      qc.setQueryData(["invitations", workspaceId], (current = []) => [
        created,
        ...current.filter((invitation) => invitation.id !== created.id),
      ]);
      qc.invalidateQueries({ queryKey: ["invitations", workspaceId] });
    },
  });
  const resend = useMutation({
    mutationFn: (invitationId) =>
      invitationClient.resend(workspaceId, invitationId),
    onSuccess: (updated) => {
      setActiveInvitation(updated);
      qc.invalidateQueries({ queryKey: ["invitations", workspaceId] });
    },
  });
  const revoke = useMutation({
    mutationFn: (invitationId) =>
      invitationClient.revoke(workspaceId, invitationId),
    onSuccess: (_, invitationId) => {
      if (activeInvitation?.id === invitationId) setActiveInvitation(null);
      qc.invalidateQueries({ queryKey: ["invitations", workspaceId] });
    },
  });
  const removeMember = useMutation({
    mutationFn: (userId) => workspaceClient.removeMember(workspaceId, userId),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["members", workspaceId] }),
  });
  const transfer = useMutation({
    mutationFn: (userId) => workspaceClient.transfer(workspaceId, userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workspace", workspaceId] });
      qc.invalidateQueries({ queryKey: ["members", workspaceId] });
    },
  });
  const pendingInvitations =
    invitations.data?.filter(
      (invitation) => !invitation.acceptedAt && !invitation.revokedAt,
    ) || [];
  return (
    <>
      <SimpleHeader title="People" />
      <main className="content narrow">
        <div className="title-row">
          <div>
            <h1>Workspace access</h1>
            <p className="muted">
              Owners can invite members, remove access, or hand over ownership.
            </p>
          </div>
        </div>
        <div className="people-tabs" role="tablist" aria-label="People">
          <button
            type="button"
            role="tab"
            id="users-tab"
            aria-controls="users-panel"
            aria-selected={activeTab === "users"}
            onClick={() => setActiveTab("users")}
          >
            Members
            <span>{members.data?.length || 0}</span>
          </button>
          {canManage && (
            <button
              type="button"
              role="tab"
              id="invitations-tab"
              aria-controls="invitations-panel"
              aria-selected={activeTab === "invitations"}
              onClick={() => setActiveTab("invitations")}
            >
              Invitations
              <span>{pendingInvitations.length}</span>
            </button>
          )}
        </div>

        {activeTab === "users" && (
          <section
            className="settings-card people-panel"
            role="tabpanel"
            id="users-panel"
            aria-labelledby="users-tab"
          >
            <h2>Workspace members</h2>
            {members.isLoading ? (
              <Spinner />
            ) : (
              members.data?.map((member) => (
                <div className="person-row" key={member.id}>
                  <span className="avatar">
                    {member.user.displayName.slice(0, 1).toUpperCase()}
                  </span>
                  <div>
                    <strong>{member.user.displayName}</strong>
                    <span>{member.user.primaryEmail}</span>
                  </div>
                  {member.user.id === workspace.data?.ownerUserId ? (
                    <span className="role-label">Owner</span>
                  ) : (
                    canManage && (
                      <div className="person-actions">
                        <button
                          className="button ghost"
                          onClick={() =>
                            confirm(
                              `Transfer ownership to ${member.user.displayName}?`,
                            ) && transfer.mutate(member.user.id)
                          }
                        >
                          Make owner
                        </button>
                        <button
                          className="button ghost danger-text"
                          onClick={() =>
                            confirm(
                              `Remove ${member.user.displayName} from this workspace?`,
                            ) && removeMember.mutate(member.user.id)
                          }
                        >
                          Remove
                        </button>
                      </div>
                    )
                  )}
                </div>
              ))
            )}
          </section>
        )}

        {activeTab === "invitations" && canManage && (
          <div
            role="tabpanel"
            id="invitations-panel"
            aria-labelledby="invitations-tab"
          >
            <section className="settings-card people-panel">
              <h2>Invite a workspace member</h2>
              <p className="muted section-description">
                Enter the email address of an existing TeamShelf user.
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
              <h2>Pending invitations</h2>
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
    </>
  );
}

export function SettingsPage() {
  const { workspaceId } = useParams();
  const workspace = useQuery({
    queryKey: ["workspace", workspaceId],
    queryFn: () => workspaceClient.get(workspaceId),
  });
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const rename = useMutation({
    mutationFn: () => workspaceClient.rename(workspaceId, name),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["workspace", workspaceId] }),
  });
  return (
    <>
      <SimpleHeader title="Settings" />
      <main className="content narrow">
        <div className="title-row">
          <div>
            <h1>Workspace settings</h1>
            <p className="muted">
              Manage this workspace's identity and lifecycle.
            </p>
          </div>
        </div>
        <section className="settings-card">
          <h2>Workspace name</h2>
          <form
            className="inline-form"
            onSubmit={(e) => {
              e.preventDefault();
              rename.mutate();
            }}
          >
            <label className="field">
              <span>Name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={workspace.data?.name}
              />
            </label>
            <button className="button secondary">Save changes</button>
          </form>
        </section>
        <section className="settings-card danger-zone">
          <h2>Danger zone</h2>
          <p>
            Schedule this workspace and its contents for deletion in 30 days.
          </p>
          {workspace.data?.status === "PENDING_DELETION" ? (
            <button
              className="button secondary"
              onClick={() =>
                workspaceClient.cancelDeletion(workspaceId).then(() =>
                  qc.invalidateQueries({
                    queryKey: ["workspace", workspaceId],
                  }),
                )
              }
            >
              Cancel deletion
            </button>
          ) : (
            <button
              className="button danger-button"
              onClick={() =>
                confirm("Schedule this workspace for deletion?") &&
                workspaceClient.scheduleDeletion(workspaceId).then(() =>
                  qc.invalidateQueries({
                    queryKey: ["workspace", workspaceId],
                  }),
                )
              }
            >
              Schedule deletion
            </button>
          )}
        </section>
      </main>
    </>
  );
}
function SimpleHeader({ title }) {
  return (
    <header className="content-header">
      <div className="breadcrumbs">
        <span>{title}</span>
      </div>
    </header>
  );
}
