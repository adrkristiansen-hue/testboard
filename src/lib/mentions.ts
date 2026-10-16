// @mentions (users and teams) and #ID work item references.
//
// In rich text they are Tiptap "mention" nodes:
//   { type: "mention", attrs: { id: "user:<id>" | "team:<id>" | "<workItemId>", label, mentionSuggestionChar: "@" | "#" } }
// In plain text (REST API, imports) the syntax is:
//   @[Display Name]   @email@example.com   #123
import type { RtDoc, RtNode } from "./richtext";
import { textToDoc } from "./richtext";

export interface MentionSet {
  userIds: string[];
  teamIds: string[];
  itemIds: number[];
}

export function extractMentions(doc: RtNode | null | undefined): MentionSet {
  const users = new Set<string>();
  const teams = new Set<string>();
  const items = new Set<number>();
  const walk = (n: RtNode) => {
    if (n.type === "mention") {
      const id = String(n.attrs?.id ?? "");
      const ch = (n.attrs?.mentionSuggestionChar as string) ?? "@";
      if (ch === "#") {
        const num = Number(id.replace(/^#/, ""));
        if (Number.isInteger(num) && num > 0) items.add(num);
      } else if (id.startsWith("user:")) users.add(id.slice(5));
      else if (id.startsWith("team:")) teams.add(id.slice(5));
    }
    for (const c of n.content ?? []) walk(c);
  };
  if (doc) walk(doc);
  return { userIds: [...users], teamIds: [...teams], itemIds: [...items] };
}

export type PlainToken =
  | { kind: "text"; text: string }
  | { kind: "user"; raw: string; key: string }
  | { kind: "item"; raw: string; id: number };

// @[Name with spaces] | @email | #123  (the # must not follow a word character, e.g. "C#1")
const TOKEN_RE = /@\[([^\]\n]{1,80})\]|@([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})|(?<![\w&])#(\d{1,9})\b/g;

/** Split plain text into text / mention / item-reference tokens. */
export function tokenizeMentions(text: string): PlainToken[] {
  const out: PlainToken[] = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN_RE)) {
    const start = m.index ?? 0;
    if (start > last) out.push({ kind: "text", text: text.slice(last, start) });
    if (m[1] !== undefined) out.push({ kind: "user", raw: m[0], key: m[1].trim() });
    else if (m[2] !== undefined) out.push({ kind: "user", raw: m[0], key: m[2].toLowerCase() });
    else out.push({ kind: "item", raw: m[0], id: Number(m[3]) });
    last = start + m[0].length;
  }
  if (last < text.length) out.push({ kind: "text", text: text.slice(last) });
  return out;
}

export interface MentionDirectory {
  users: { id: string; name: string; email: string }[];
  teams: { id: string; name: string }[];
  /** Returns true if the work item id exists (unknown ids stay as plain text). */
  itemExists?: (id: number) => boolean;
}

/** Resolve a mention key (name or email) to "user:<id>" / "team:<id>". */
export function resolveMentionKey(key: string, dir: MentionDirectory): { id: string; label: string } | null {
  const k = key.toLowerCase();
  const u = dir.users.find((x) => x.email.toLowerCase() === k || x.name.toLowerCase() === k);
  if (u) return { id: `user:${u.id}`, label: u.name };
  const t = dir.teams.find((x) => x.name.toLowerCase() === k);
  if (t) return { id: `team:${t.id}`, label: t.name };
  return null;
}

/** Convert plain text with mention syntax into a rich text doc with mention nodes. */
export function plainTextToMentionDoc(text: string, dir: MentionDirectory): RtDoc {
  const base = textToDoc(text);
  for (const para of base.content ?? []) {
    const line = para.content?.[0]?.text;
    if (!line) continue;
    const nodes: RtNode[] = [];
    for (const tok of tokenizeMentions(line)) {
      if (tok.kind === "text") nodes.push({ type: "text", text: tok.text });
      else if (tok.kind === "user") {
        const r = resolveMentionKey(tok.key, dir);
        nodes.push(r ? { type: "mention", attrs: { id: r.id, label: r.label, mentionSuggestionChar: "@" } } : { type: "text", text: tok.raw });
      } else {
        const exists = dir.itemExists ? dir.itemExists(tok.id) : true;
        nodes.push(exists ? { type: "mention", attrs: { id: String(tok.id), label: `#${tok.id}`, mentionSuggestionChar: "#" } } : { type: "text", text: tok.raw });
      }
    }
    // Merge adjacent text nodes
    para.content = nodes.reduce<RtNode[]>((acc, n) => {
      const prev = acc[acc.length - 1];
      if (prev && prev.type === "text" && n.type === "text") prev.text = (prev.text ?? "") + (n.text ?? "");
      else acc.push(n);
      return acc;
    }, []);
  }
  return base;
}
