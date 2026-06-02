import { useEffect } from "react";
/**
 * Google Tag Manager: injects the GTM script in the document head and the
 * fallback noscript in the body. Only runs when VITE_GTM_ID is set and
 * matches the format GTM-XXXXXXX (security: avoid injecting arbitrary IDs).
 */

declare global {
  interface Window {
    dataLayer: Record<string, unknown>[];
  }
}

const GTM_ID_PATTERN = /^GTM-[A-Z0-9]+$/;

function getGtmId(): string | null {
  const id = import.meta.env.VITE_GTM_ID;
  if (typeof id !== "string" || !id.trim()) return null;
  const trimmed = id.trim();
  return GTM_ID_PATTERN.test(trimmed) ? trimmed : null;
}

const GTM_ID = getGtmId();

export function GoogleTagManagerHead() {
  useEffect(() => {
    if (!GTM_ID) return;

    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ "gtm.start": new Date().getTime(), event: "gtm.js" });

    const script = document.createElement("script");
    script.src = `https://www.googletagmanager.com/gtm.js?id=${GTM_ID}`;
    script.async = true;
    document.head.appendChild(script);
  }, []);

  return null;
}

export function GoogleTagManagerBody() {
  if (!GTM_ID) return null;
  return (
    <noscript>
      <iframe
        title="Google Tag Manager"
        src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
        height={0}
        width={0}
        style={{ display: "none", visibility: "hidden" }}
      />
    </noscript>
  );
}
