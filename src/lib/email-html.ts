/**
 * Escapes text for HTML element content and quoted attribute values.
 */
export function escapeEmailHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const CONSTRUCTION_TOKEN: unique symbol = Symbol("TrustedEmailHtml");

/**
 * Markup that is safe to insert into an email HTML body without escaping.
 * Instances can only be created by the builders in this module (`emailHtml`,
 * `joinEmailHtml`, `buildEmailHtmlList`); the constructor rejects any caller
 * without the module-private token.
 */
export class TrustedEmailHtml {
  readonly #html: string;

  constructor(token: typeof CONSTRUCTION_TOKEN, html: string) {
    if (token !== CONSTRUCTION_TOKEN) {
      throw new TypeError("TrustedEmailHtml can only be created by @/lib/email-html builders.");
    }
    this.#html = html;
  }

  static isTrusted(value: unknown): value is TrustedEmailHtml {
    return typeof value === "object" && value !== null && #html in value;
  }

  get html(): string {
    return this.#html;
  }

  toString(): string {
    return this.#html;
  }
}

function trustedMarkup(html: string): TrustedEmailHtml {
  return new TrustedEmailHtml(CONSTRUCTION_TOKEN, html);
}

export type EmailHtmlValue = string | number | TrustedEmailHtml | null | undefined;

export function emailHtmlValueOrEmpty(value: EmailHtmlValue): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "object") {
    if (TrustedEmailHtml.isTrusted(value)) {
      return value.html;
    }
    throw new TypeError("Untrusted object passed as an email HTML value.");
  }
  return escapeEmailHtml(String(value));
}

/**
 * Tagged template for building email HTML fragments. Literal template text is
 * trusted; every interpolated value is escaped unless it is `TrustedEmailHtml`.
 */
export function emailHtml(
  strings: TemplateStringsArray,
  ...values: EmailHtmlValue[]
): TrustedEmailHtml {
  if (!Object.isFrozen(strings) || !Array.isArray(strings.raw)) {
    throw new TypeError("emailHtml must be used as a tagged template literal.");
  }
  let markup = strings[0] ?? "";
  values.forEach((value, index) => {
    markup += emailHtmlValueOrEmpty(value) + (strings[index + 1] ?? "");
  });
  return trustedMarkup(markup);
}

export function joinEmailHtml(
  fragments: readonly TrustedEmailHtml[],
  separator?: TrustedEmailHtml,
): TrustedEmailHtml {
  return trustedMarkup(
    fragments
      .map((fragment) => emailHtmlValueOrEmpty(fragment))
      .join(separator === undefined ? "" : emailHtmlValueOrEmpty(separator)),
  );
}

/** `<ul><li>…</li></ul>` with escaped item text, or an em dash paragraph when empty. */
export function buildEmailHtmlList(items: readonly string[]): TrustedEmailHtml {
  if (items.length === 0) {
    return emailHtml`<p>—</p>`;
  }
  return emailHtml`<ul>${joinEmailHtml(items.map((item) => emailHtml`<li>${item}</li>`))}</ul>`;
}
