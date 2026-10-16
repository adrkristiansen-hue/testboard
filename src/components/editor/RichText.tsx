"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { RtNode } from "@/lib/richtext";

/**
 * Read-only renderer for stored Tiptap JSON. Renders React elements directly
 * (never raw HTML), so stored content cannot inject markup.
 */
export function RichText({ doc, projectId, className = "" }: { doc: RtNode | null | undefined; projectId: string; className?: string }) {
  if (!doc) return null;
  return <div className={`rt ${className}`}>{renderChildren(doc, projectId)}</div>;
}

function renderChildren(n: RtNode, projectId: string): ReactNode {
  return (n.content ?? []).map((c, i) => <RtElement key={i} node={c} projectId={projectId} />);
}

function safeHref(href: unknown): string | null {
  const h = String(href ?? "");
  return /^(https?:|mailto:|\/)/i.test(h) ? h : null;
}

function RtElement({ node, projectId }: { node: RtNode; projectId: string }): ReactNode {
  const kids = renderChildren(node, projectId);
  switch (node.type) {
    case "paragraph":
      return <p>{kids}</p>;
    case "heading": {
      const level = Number(node.attrs?.level ?? 2);
      return level <= 1 ? <h1>{kids}</h1> : level === 2 ? <h2>{kids}</h2> : <h3>{kids}</h3>;
    }
    case "bulletList":
      return <ul>{kids}</ul>;
    case "orderedList":
      return <ol>{kids}</ol>;
    case "listItem":
      return <li>{kids}</li>;
    case "blockquote":
      return <blockquote>{kids}</blockquote>;
    case "codeBlock":
      return (
        <pre>
          <code>{kids}</code>
        </pre>
      );
    case "hardBreak":
      return <br />;
    case "horizontalRule":
      return <hr />;
    case "image": {
      const src = String(node.attrs?.src ?? "");
      if (!src.startsWith("/api/attachments/")) return null;
      return (
        <a href={src} target="_blank" rel="noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={String(node.attrs?.alt ?? "Screenshot")} loading="lazy" />
        </a>
      );
    }
    case "mention": {
      const ch = (node.attrs?.mentionSuggestionChar as string) ?? "@";
      const id = String(node.attrs?.id ?? "");
      const label = String(node.attrs?.label ?? id);
      if (ch === "#") {
        const num = id.replace(/^#/, "");
        return (
          <Link href={`/p/${projectId}/items/${num}`} className="mention">
            #{num}
          </Link>
        );
      }
      return <span className="mention">@{label}</span>;
    }
    case "text": {
      let el: ReactNode = node.text ?? "";
      for (const m of node.marks ?? []) {
        if (m.type === "bold") el = <strong>{el}</strong>;
        else if (m.type === "italic") el = <em>{el}</em>;
        else if (m.type === "strike") el = <s>{el}</s>;
        else if (m.type === "underline") el = <u>{el}</u>;
        else if (m.type === "code") el = <code>{el}</code>;
        else if (m.type === "link") {
          const href = safeHref(m.attrs?.href);
          if (href)
            el = (
              <a href={href} target="_blank" rel="noopener noreferrer nofollow">
                {el}
              </a>
            );
        }
      }
      return el;
    }
    default:
      return <>{kids}</>;
  }
}
