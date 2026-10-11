const PREVIEW_DOCUMENT_STYLE =
  "body{margin:16px;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:14px;line-height:1.5;color:#1f2937;background:#fff;}a{color:#1d4ed8;}ul{padding-left:1.25rem;}";

const PREVIEW_DOCUMENT_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; img-src https: data:; font-src https: data:; form-action 'none'; base-uri 'none'";

type Props = {
  html: string;
  title: string;
  className?: string;
};

/**
 * Renders email HTML in a fully sandboxed iframe (no scripts, forms, popups,
 * top navigation, or same-origin access) with a restrictive CSP, so stored or
 * edited markup cannot run in or reach the admin session.
 */
export function EmailHtmlPreviewFrame({ html, title, className }: Props) {
  const srcDoc = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${PREVIEW_DOCUMENT_CSP}"><style>${PREVIEW_DOCUMENT_STYLE}</style></head><body>${html}</body></html>`;

  return (
    <iframe
      title={title}
      sandbox=""
      srcDoc={srcDoc}
      referrerPolicy="no-referrer"
      className={`h-80 w-full rounded-lg border border-border bg-white ${className ?? ""}`}
    />
  );
}
