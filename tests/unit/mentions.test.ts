import { describe, expect, it } from "vitest";
import { extractMentions, plainTextToMentionDoc, resolveMentionKey, tokenizeMentions } from "@/lib/mentions";
import { docToText } from "@/lib/richtext";

const dir = {
  users: [
    { id: "u1", name: "Kari Testersen", email: "kari@example.test" },
    { id: "u2", name: "Ola Lead", email: "ola@example.test" },
  ],
  teams: [{ id: "t1", name: "EC team" }],
  itemExists: (id: number) => id < 1000,
};

describe("tokenizeMentions", () => {
  it("finds bracketed names, emails and #IDs", () => {
    const toks = tokenizeMentions("Hi @[Kari Testersen], see #12 and ask @ola@example.test.");
    expect(toks.filter((t) => t.kind !== "text")).toEqual([
      { kind: "user", raw: "@[Kari Testersen]", key: "Kari Testersen" },
      { kind: "item", raw: "#12", id: 12 },
      { kind: "user", raw: "@ola@example.test", key: "ola@example.test" },
    ]);
  });

  it("ignores # inside words and HTML entities", () => {
    expect(tokenizeMentions("C#1 and &#39; and abc#5").every((t) => t.kind === "text")).toBe(true);
  });

  it("keeps surrounding text intact", () => {
    const toks = tokenizeMentions("a #1 b");
    expect(toks).toEqual([
      { kind: "text", text: "a " },
      { kind: "item", raw: "#1", id: 1 },
      { kind: "text", text: " b" },
    ]);
  });
});

describe("resolveMentionKey", () => {
  it("resolves users by name or email (case-insensitive) and teams by name", () => {
    expect(resolveMentionKey("kari testersen", dir)).toEqual({ id: "user:u1", label: "Kari Testersen" });
    expect(resolveMentionKey("OLA@example.test", dir)).toEqual({ id: "user:u2", label: "Ola Lead" });
    expect(resolveMentionKey("ec team", dir)).toEqual({ id: "team:t1", label: "EC team" });
    expect(resolveMentionKey("nobody", dir)).toBeNull();
  });
});

describe("plain text -> mention doc", () => {
  it("creates mention nodes and extracts them again", () => {
    const doc = plainTextToMentionDoc("@[EC team] please retest #42\nThanks @kari@example.test, not #5000", dir);
    const m = extractMentions(doc);
    expect(m.teamIds).toEqual(["t1"]);
    expect(m.userIds).toEqual(["u1"]);
    expect(m.itemIds).toEqual([42]); // #5000 does not exist -> stays text
    expect(docToText(doc)).toBe("@EC team please retest #42\nThanks @Kari Testersen, not #5000");
  });

  it("leaves unknown names as plain text", () => {
    const doc = plainTextToMentionDoc("hello @[Ghost]", dir);
    expect(extractMentions(doc)).toEqual({ userIds: [], teamIds: [], itemIds: [] });
    expect(docToText(doc)).toBe("hello @[Ghost]");
  });
});
