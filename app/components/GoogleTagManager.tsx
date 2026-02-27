/**
 * Google Tag Manager: injects the GTM script in the document head and the
 * fallback noscript in the body. Only runs when VITE_GTM_ID is set and
 * matches the format GTM-XXXXXXX (security: avoid injecting arbitrary IDs).
 */
const GTM_ID_PATTERN = /^GTM-[A-Z0-9]+$/;

function getGtmId(): string | null {
  const id = import.meta.env.VITE_GTM_ID;
  if (typeof id !== "string" || !id.trim()) return null;
  const trimmed = id.trim();
  return GTM_ID_PATTERN.test(trimmed) ? trimmed : null;
}

const gtmScript = (id: string) =>
  `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${id}');`;

export function GoogleTagManagerHead() {
  const id = getGtmId();
  if (!id) return null;
  return (
    <script
      dangerouslySetInnerHTML={{ __html: gtmScript(id) }}
      type="text/javascript"
    />
  );
}

export function GoogleTagManagerBody() {
  const id = getGtmId();
  if (!id) return null;
  return (
    <noscript>
      <iframe
        title="Google Tag Manager"
        src={`https://www.googletagmanager.com/ns.html?id=${id}`}
        height={0}
        width={0}
        style={{ display: "none", visibility: "hidden" }}
      />
    </noscript>
  );
}
