// Rich text is stored as Tiptap/ProseMirror JSON. These helpers convert to and
// from plain text without needing a DOM, so they work in server code and tests.

export interface RtNode {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  content?: RtNode[];
}

export type RtDoc = RtNode & { type: "doc" };

export function emptyDoc(): RtDoc {
  return { type: "doc", content: [{ type: "paragraph" }] };
}

export function parseDoc(json: string | null | undefined): RtDoc | null {
  if (!json) return null;
  try {
    const v = JSON.parse(json);
    if (v && v.type === "doc") return v as RtDoc;
  } catch {
    // Legacy plain text
    return textToDoc(json);
  }
  return null;
}

const BLOCK_TYPES = new Set(["paragraph", "heading", "blockquote", "listItem", "codeBlock", "tableRow"]);

export function docToText(doc: RtNode | null | undefined): string {
  if (!doc) return "";
  const out: string[] = [];
  const walk = (n: RtNode) => {
    if (n.type === "text") out.push(n.text ?? "");
    else if (n.type === "mention") {
      const ch = (n.attrs?.mentionSuggestionChar as string) ?? "@";
      const label = (n.attrs?.label as string) ?? (n.attrs?.id as string) ?? "";
      out.push(ch === "#" ? `#${String(n.attrs?.id ?? label).replace(/^#/, "")}` : `@${label}`);
    } else if (n.type === "hardBreak") out.push("\n");
    else if (n.type === "image") out.push("[image]");
    for (const c of n.content ?? []) walk(c);
    if (BLOCK_TYPES.has(n.type)) out.push("\n");
  };
  walk(doc);
  return out.join("").replace(/\n{3,}/g, "\n\n").trim();
}

/** Plain text (one paragraph per line) to a doc. Mentions are not resolved here. */
export function textToDoc(text: string): RtDoc {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  return {
    type: "doc",
    content: lines.map((line) => (line ? { type: "paragraph", content: [{ type: "text", text: line }] } : { type: "paragraph" })),
  };
}

export function isDocEmpty(doc: RtNode | null | undefined): boolean {
  if (!doc) return true;
  let found = false;
  const walk = (n: RtNode) => {
    if (found) return;
    if ((n.type === "text" && (n.text ?? "").trim()) || n.type === "mention" || n.type === "image") found = true;
    for (const c of n.content ?? []) walk(c);
  };
  walk(doc);
  return !found;
}

/** Collect image src values (used to link pasted screenshots to attachments). */
export function collectImageSrcs(doc: RtNode | null | undefined): string[] {
  const srcs: string[] = [];
  const walk = (n: RtNode) => {
    if (n.type === "image" && typeof n.attrs?.src === "string") srcs.push(n.attrs.src);
    for (const c of n.content ?? []) walk(c);
  };
  if (doc) walk(doc);
  return srcs;
}

/** Keep only safe image sources (our own attachment URLs and data-less relative paths). */
export function sanitizeDoc(doc: RtNode): RtNode {
  const clean = (n: RtNode): RtNode | null => {
    if (n.type === "image") {
      const src = String(n.attrs?.src ?? "");
      if (!src.startsWith("/api/attachments/")) return null;
    }
    const marks = n.marks?.filter((m) => {
      if (m.type !== "link") return true;
      const href = String(m.attrs?.href ?? "");
      return /^(https?:|mailto:|\/)/i.test(href);
    });
    const content = n.content?.map(clean).filter((c): c is RtNode => c !== null);
    return { ...n, ...(marks ? { marks } : {}), ...(content ? { content } : {}) };
  };
  return clean(doc) ?? emptyDoc();
}
