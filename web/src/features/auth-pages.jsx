import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate, useSearchParams } from "react-router";
import { invitationPasswordSchema, loginSchema } from "@teamshelf/contracts";
import { authClient, invitationClient } from "../lib/api.js";
import { ErrorNotice, Spinner } from "../components/ui.jsx";
import { GoogleButton } from "../components/google-button.jsx";

function AuthFrame({ eyebrow, title, copy, children }) {
  return (
    <main className="auth-layout">
      <section className="auth-story">
        <Link className="brand light" to="/">
          TeamShelf
        </Link>
        <div>
          <span className="eyebrow">{eyebrow}</span>
          <h1>{title}</h1>
          <p>{copy}</p>
        </div>
        <blockquote>
          “Everything our team needs, exactly where we expect it.”
        </blockquote>
      </section>
      <section className="auth-panel">{children}</section>
    </main>
  );
}
function Field({ label, error, ...input }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input {...input} />
      {error && <small role="alert">{error.message}</small>}
    </label>
  );
}

export function LoginPage() {
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({ resolver: zodResolver(loginSchema) });
  const login = useMutation({
    mutationFn: authClient.login,
    onSuccess: () => navigate("/workspaces"),
  });
  const google = useMutation({
    mutationFn: (credential) => authClient.google(credential),
    onSuccess: () => navigate("/workspaces"),
  });
  const handleGoogle = useCallback((value) => google.mutate(value), [google]);
  return (
    <AuthFrame
      eyebrow="Welcome back"
      title="Your team's knowledge, together."
      copy="One private home for the documents that keep your work moving."
    >
      <div className="form-card">
        <div>
          <span className="eyebrow ink">Member sign in</span>
          <h2>Continue to TeamShelf</h2>
          <p className="muted">Use the email connected to your invitation.</p>
        </div>
        {login.error && <ErrorNotice error={login.error} />}
        <form onSubmit={handleSubmit((data) => login.mutate(data))}>
          <Field
            label="Email address"
            type="email"
            autoComplete="email"
            {...register("email")}
            error={errors.email}
          />
          <Field
            label="Password"
            type="password"
            autoComplete="current-password"
            {...register("password")}
            error={errors.password}
          />
          <div className="form-link">
            <Link to="/forgot-password">Forgot password?</Link>
          </div>
          <button className="button primary wide" disabled={login.isPending}>
            {login.isPending ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <div className="divider">
          <span>or</span>
        </div>
        {google.error && <ErrorNotice error={google.error} />}
        <GoogleButton onCredential={handleGoogle} />
        <p className="fine-print">
          TeamShelf is invite-only. Ask your workspace owner for access.
        </p>
      </div>
    </AuthFrame>
  );
}

export function InvitePage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [token] = useState(
    () => params.get("token") || sessionStorage.getItem("invitationToken"),
  );
  useEffect(() => {
    if (token) {
      sessionStorage.setItem("invitationToken", token);
      history.replaceState({}, "", "/invite");
    }
  }, [token]);
  const status = useQuery({
    queryKey: ["invitation", token],
    queryFn: () => invitationClient.status(token),
    enabled: Boolean(token),
    retry: false,
  });
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({ resolver: zodResolver(invitationPasswordSchema) });
  const accept = useMutation({
    mutationFn: (body) => invitationClient.acceptPassword(token, body),
    onSuccess: () => {
      sessionStorage.removeItem("invitationToken");
      navigate("/workspaces");
    },
  });
  const google = useMutation({
    mutationFn: (credential) => authClient.google(credential, token),
    onSuccess: () => {
      sessionStorage.removeItem("invitationToken");
      navigate("/workspaces");
    },
  });
  const handleGoogle = useCallback((value) => google.mutate(value), [google]);
  return (
    <AuthFrame
      eyebrow="You've been invited"
      title="Make yourself at home."
      copy="Create your secure account and join the people already sharing work on TeamShelf."
    >
      <div className="form-card">
        {status.isLoading ? (
          <Spinner label="Checking your invitation…" />
        ) : status.error || !token ? (
          <>
            <h2>Invitation unavailable</h2>
            <ErrorNotice error={status.error} />
            <Link className="button secondary" to="/login">
              Back to sign in
            </Link>
          </>
        ) : (
          <>
            <div>
              <span className="eyebrow ink">Invitation for</span>
              <h2>{status.data.email}</h2>
              <p className="muted">Choose how you'd like to join.</p>
            </div>
            {accept.error && <ErrorNotice error={accept.error} />}
            <form onSubmit={handleSubmit((data) => accept.mutate(data))}>
              <Field
                label="Your name"
                autoComplete="name"
                {...register("displayName")}
                error={errors.displayName}
              />
              <Field
                label="Create a password"
                type="password"
                autoComplete="new-password"
                {...register("password")}
                error={errors.password}
              />
              <small className="hint">Use at least 12 characters.</small>
              <button
                className="button primary wide"
                disabled={accept.isPending}
              >
                {accept.isPending ? "Creating account…" : "Create account"}
              </button>
            </form>
            <div className="divider">
              <span>or</span>
            </div>
            {google.error && <ErrorNotice error={google.error} />}
            <GoogleButton onCredential={handleGoogle} />
          </>
        )}
      </div>
    </AuthFrame>
  );
}

export function ForgotPage() {
  const [sent, setSent] = useState(false);
  const { register, handleSubmit } = useForm();
  const mutation = useMutation({
    mutationFn: ({ email }) => authClient.forgot(email),
    onSuccess: () => setSent(true),
  });
  return (
    <AuthFrame
      eyebrow="Account recovery"
      title="A simple way back in."
      copy="We'll send a short-lived recovery link if there is a TeamShelf account for that address."
    >
      <div className="form-card">
        <h2>Reset your password</h2>
        {sent ? (
          <div className="notice success">
            Check your inbox. If the account exists, a reset link is on its way.
          </div>
        ) : (
          <form onSubmit={handleSubmit((d) => mutation.mutate(d))}>
            <Field
              label="Email address"
              type="email"
              required
              {...register("email")}
            />
            <button className="button primary wide">Send reset link</button>
          </form>
        )}
        <Link to="/login">Back to sign in</Link>
      </div>
    </AuthFrame>
  );
}
export function ResetPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [token] = useState(
    () => params.get("token") || sessionStorage.getItem("resetToken"),
  );
  useEffect(() => {
    if (token) {
      sessionStorage.setItem("resetToken", token);
      history.replaceState({}, "", "/reset-password");
    }
  }, [token]);
  const mutation = useMutation({
    mutationFn: ({ password }) => authClient.reset(token, password),
    onSuccess: () => {
      sessionStorage.removeItem("resetToken");
      navigate("/login");
    },
  });
  const { register, handleSubmit } = useForm();
  return (
    <AuthFrame
      eyebrow="Choose a new password"
      title="Secure your account."
      copy="Your new password will sign out every other TeamShelf session."
    >
      <div className="form-card">
        <h2>Set new password</h2>
        {mutation.error && <ErrorNotice error={mutation.error} />}
        <form onSubmit={handleSubmit((d) => mutation.mutate(d))}>
          <Field
            label="New password"
            type="password"
            minLength="12"
            required
            {...register("password")}
          />
          <button className="button primary wide">Update password</button>
        </form>
      </div>
    </AuthFrame>
  );
}
