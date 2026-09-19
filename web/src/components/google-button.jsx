import { useEffect, useRef } from "react";

export function GoogleButton({ onCredential }) {
  const ref = useRef();
  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) return;
    const initialize = () => {
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: ({ credential }) => onCredential(credential),
      });
      window.google.accounts.id.renderButton(ref.current, {
        theme: "outline",
        size: "large",
        width: 340,
      });
    };
    if (window.google) initialize();
    else {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.onload = initialize;
      document.head.append(script);
      return () => script.remove();
    }
  }, [onCredential]);
  if (!import.meta.env.VITE_GOOGLE_CLIENT_ID) return null;
  return <div ref={ref} className="google-button" />;
}
