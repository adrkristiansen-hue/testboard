import { describe, expect, it } from "vitest";
import { buildNotificationEmail, itemUrl, toEml } from "@/lib/email";

const base = {
  to: "maja@demo.test",
  recipientName: "Maja",
  type: "ASSIGNED" as const,
  message: "Erik assigned you #12 Hire",
  itemId: 12,
  itemTitle: "Hire <script>",
  projectId: "p1",
  projectName: "HR Transformation",
  appUrl: "https://tb.example.com/",
};

describe("notification email", () => {
  it("builds subject and deep link", () => {
    const m = buildNotificationEmail(base);
    expect(m.subject).toBe("[HR Transformation] Assigned to you: #12 Hire <script>");
    expect(m.text).toContain("https://tb.example.com/p/p1/items/12");
    expect(itemUrl("http://x/", "a b", 3)).toBe("http://x/p/a%20b/items/3");
  });
  it("escapes HTML", () => {
    const m = buildNotificationEmail(base);
    expect(m.html).toContain("Hire &lt;script&gt;");
    expect(m.html).not.toContain("<script>");
  });
  it("prevents header injection through titles and addresses", () => {
    const m = buildNotificationEmail({ ...base, itemTitle: "Hire\r\nBcc: evil@x.com", to: "maja@demo.test\nBcc: evil@x.com" });
    expect(m.subject).not.toMatch(/[\r\n]/);
    expect(m.to).not.toMatch(/[\r\n]/);
    const eml = toEml(m, "TestBoard <no-reply@x>");
    const headers = eml.split("\r\n\r\n")[0];
    expect(headers.split("\r\n").filter((l) => l.startsWith("Bcc:"))).toHaveLength(0);
  });
});
