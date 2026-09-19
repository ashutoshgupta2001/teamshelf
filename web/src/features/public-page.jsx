import { useQuery } from "@tanstack/react-query";
import { Download, FileText, ShieldCheck } from "lucide-react";
import { useParams } from "react-router";
import { documentClient } from "../lib/api.js";
import { ErrorNotice, Spinner } from "../components/ui.jsx";

export function PublicSharePage() {
  const { token } = useParams();
  const metadata = useQuery({
    queryKey: ["public-share", token],
    queryFn: () => documentClient.publicMetadata(token),
    retry: false,
  });
  const open = async () => {
    const auth = await documentClient.publicContent(token);
    window.location.assign(auth.url);
  };
  return (
    <main className="public-page">
      <header>
        <span className="brand">TeamShelf</span>
        <span className="secure-label">
          <ShieldCheck size={15} /> Secure document link
        </span>
      </header>
      <section className="public-card">
        {metadata.isLoading ? (
          <Spinner label="Opening document…" />
        ) : metadata.error ? (
          <>
            <div className="public-icon unavailable">
              <FileText />
            </div>
            <h1>This document is unavailable</h1>
            <p>
              The link may have expired or been revoked. Ask the person who
              shared it for a new link.
            </p>
            <ErrorNotice
              error={{
                message: "For privacy, TeamShelf cannot provide more details.",
              }}
            />
          </>
        ) : (
          <>
            <div className="public-icon">
              <FileText />
            </div>
            <span className="eyebrow ink">Shared document</span>
            <h1>{metadata.data.name}</h1>
            <div className="file-meta">
              <span>
                {metadata.data.contentType.split("/").pop().toUpperCase()}
              </span>
              <i /> <span>{formatSize(metadata.data.sizeBytes)}</span>
              <i />{" "}
              <span>
                Expires {new Date(metadata.data.expiresAt).toLocaleDateString()}
              </span>
            </div>
            <button className="button primary large" onClick={open}>
              {metadata.data.allowDownload ? (
                <>
                  <Download size={19} /> Open or download
                </>
              ) : (
                "Open document"
              )}
            </button>
            <p className="fine-print">
              This link gives access to this document only. No TeamShelf account
              is required.
            </p>
          </>
        )}
      </section>
      <footer>Shared privately with TeamShelf</footer>
    </main>
  );
}
const formatSize = (bytes) =>
  bytes > 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
