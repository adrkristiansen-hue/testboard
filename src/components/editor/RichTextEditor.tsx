"use client";

import { useEffect, useRef } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Mention from "@tiptap/extension-mention";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import type { SuggestionOptions, SuggestionProps, SuggestionKeyDownProps } from "@tiptap/suggestion";
import type { RtDoc } from "@/lib/richtext";
import { useProject } from "../ProjectProvider";
import { searchItems } from "@/server/actions/items";
import { uploadFile } from "../item/upload";
import { useToast } from "../ui/Toast";

interface SuggestItem {
  id: string;
  label: string;
  hint?: string;
  color?: string;
}

/** Plain-DOM suggestion popup (keyboard navigable, announced as a listbox). */
function popupRenderer(): ReturnType<NonNullable<SuggestionOptions<SuggestItem>["render"]>> {
  let el: HTMLDivElement | null = null;
  let props: SuggestionProps<SuggestItem> | null = null;
  let selected = 0;

  const draw = () => {
    if (!el || !props) return;
    el.innerHTML = "";
    if (props.items.length === 0) {
      const empty = document.createElement("div");
      empty.className = "px-2 py-1 text-sm text-gray-500";
      empty.textContent = "No matches";
      el.appendChild(empty);
    }
    props.items.forEach((item, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.setAttribute("role", "option");
      b.setAttribute("aria-selected", String(i === selected));
      const dot = document.createElement("span");
      dot.style.cssText = `display:inline-block;width:10px;height:10px;border-radius:999px;background:${item.color ?? "#94a3b8"}`;
      const txt = document.createElement("span");
      txt.textContent = item.label;
      b.append(dot, txt);
      if (item.hint) {
        const h = document.createElement("span");
        h.style.cssText = "margin-left:auto;color:#6b7280;font-size:12px";
        h.textContent = item.hint;
        b.appendChild(h);
      }
      b.addEventListener("mousedown", (e) => {
        e.preventDefault();
        props?.command(item);
      });
      el!.appendChild(b);
    });
    const rect = props.clientRect?.();
    if (rect) {
      el.style.left = `${Math.min(rect.left, window.innerWidth - 260)}px`;
      el.style.top = `${rect.bottom + 4}px`;
    }
  };

  return {
    onStart: (p) => {
      props = p;
      selected = 0;
      el = document.createElement("div");
      el.className = "suggest-popup";
      el.setAttribute("role", "listbox");
      document.body.appendChild(el);
      draw();
    },
    onUpdate: (p) => {
      props = p;
      selected = Math.min(selected, Math.max(0, p.items.length - 1));
      draw();
    },
    onKeyDown: ({ event }: SuggestionKeyDownProps) => {
      if (!props) return false;
      if (event.key === "ArrowDown") {
        selected = (selected + 1) % Math.max(1, props.items.length);
        draw();
        return true;
      }
      if (event.key === "ArrowUp") {
        selected = (selected - 1 + props.items.length) % Math.max(1, props.items.length);
        draw();
        return true;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        const item = props.items[selected];
        if (item) props.command(item);
        return true;
      }
      if (event.key === "Escape") {
        el?.remove();
        el = null;
        return true;
      }
      return false;
    },
    onExit: () => {
      el?.remove();
      el = null;
      props = null;
    },
  };
}

export function RichTextEditor({
  value,
  onChange,
  placeholder,
  workItemId,
  editable = true,
  autoFocus = false,
  ariaLabel,
  onSubmitShortcut,
  minHeight = 80,
}: {
  value: RtDoc | null;
  onChange: (doc: RtDoc) => void;
  placeholder?: string;
  /** Needed to upload pasted images; omit for unsaved items. */
  workItemId?: number;
  editable?: boolean;
  autoFocus?: boolean;
  ariaLabel: string;
  /** Ctrl/Cmd+Enter */
  onSubmitShortcut?: () => void;
  minHeight?: number;
}) {
  const { meta, typeById } = useProject();
  const toast = useToast();
  const onChangeRef = useRef(onChange);
  const submitRef = useRef(onSubmitShortcut);
  const workItemRef = useRef(workItemId);
  useEffect(() => {
    onChangeRef.current = onChange;
    submitRef.current = onSubmitShortcut;
    workItemRef.current = workItemId;
  });

  const insertImages = async (editor: Editor, files: File[]) => {
    const id = workItemRef.current;
    if (!id) {
      toast("Save the work item before pasting images.", "error");
      return;
    }
    for (const f of files) {
      try {
        const up = await uploadFile(f, id);
        editor.chain().focus().setImage({ src: up.url, alt: up.fileName }).run();
      } catch (e) {
        toast(e instanceof Error ? e.message : "Upload failed", "error");
      }
    }
  };

  const editor = useEditor({
    immediatelyRender: false,
    editable,
    autofocus: autoFocus ? "end" : false,
    extensions: [
      StarterKit.configure({ link: { openOnClick: false, autolink: true, protocols: ["http", "https", "mailto"] } }),
      Image.configure({ inline: false }),
      Placeholder.configure({ placeholder: placeholder ?? "" }),
      Mention.configure({
        HTMLAttributes: { class: "mention" },
        renderText: ({ node }) => (node.attrs.mentionSuggestionChar === "#" ? `#${node.attrs.id}` : `@${node.attrs.label ?? node.attrs.id}`),
        renderHTML: ({ node }) => [
          "span",
          { class: "mention", "data-id": node.attrs.id },
          node.attrs.mentionSuggestionChar === "#" ? `#${node.attrs.id}` : `@${node.attrs.label ?? node.attrs.id}`,
        ],
        suggestions: [
          {
            char: "@",
            allowSpaces: true,
            items: ({ query }) => {
              const q = query.toLowerCase();
              const users: SuggestItem[] = meta.users
                .filter((u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
                .map((u) => ({ id: `user:${u.id}`, label: u.name, color: u.color }));
              const teams: SuggestItem[] = meta.teams.filter((t) => t.name.toLowerCase().includes(q)).map((t) => ({ id: `team:${t.id}`, label: t.name, hint: "team", color: "#0f62fe" }));
              return [...users, ...teams].slice(0, 8);
            },
            render: popupRenderer,
          },
          {
            char: "#",
            items: async ({ query }) => {
              const rows = await searchItems(meta.id, query);
              return rows.map((r) => ({ id: String(r.id), label: `#${r.id} ${r.title}`, color: typeById.get(r.typeId)?.color }));
            },
            command: ({ editor, range, props }) => {
              editor
                .chain()
                .focus()
                .insertContentAt(range, [
                  { type: "mention", attrs: { id: props.id, label: `#${props.id}`, mentionSuggestionChar: "#" } },
                  { type: "text", text: " " },
                ])
                .run();
            },
            render: popupRenderer,
          },
        ],
      }),
    ],
    content: value ?? undefined,
    editorProps: {
      attributes: { "aria-label": ariaLabel, role: "textbox", "aria-multiline": "true", style: `min-height:${minHeight}px;padding:8px` },
      handleKeyDown: (_view, event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === "Enter" && submitRef.current) {
          submitRef.current();
          return true;
        }
        return false;
      },
      handlePaste: (_view, event) => {
        const files = [...(event.clipboardData?.files ?? [])].filter((f) => f.type.startsWith("image/"));
        if (files.length === 0 || !editorRef.current) return false;
        event.preventDefault();
        void insertImages(editorRef.current, files);
        return true;
      },
      handleDrop: (_view, event) => {
        const files = [...((event as DragEvent).dataTransfer?.files ?? [])].filter((f) => f.type.startsWith("image/"));
        if (files.length === 0 || !editorRef.current) return false;
        event.preventDefault();
        void insertImages(editorRef.current, files);
        return true;
      },
    },
    onUpdate: ({ editor }) => onChangeRef.current(editor.getJSON() as RtDoc),
  });
  const editorRef = useRef<Editor | null>(null);
  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  useEffect(() => {
    // Don't emit an update event (it would mark the form dirty).
    if (editor && editor.isEditable !== editable) editor.setEditable(editable, false);
  }, [editor, editable]);

  return (
    <div className="rt rt-editor">
      {editable && editor && <Toolbar editor={editor} />}
      <EditorContent editor={editor} />
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const btn = (label: string, glyph: string, active: boolean, run: () => void) => (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      onMouseDown={(e) => e.preventDefault()}
      onClick={run}
      className={`h-7 min-w-7 rounded px-1.5 text-sm ${active ? "bg-brand-soft text-brand-dark" : "text-ink-muted hover:bg-gray-100"}`}
    >
      {glyph}
    </button>
  );
  return (
    <div className="flex flex-wrap gap-0.5 border-b border-line px-1 py-0.5" role="toolbar" aria-label="Formatting">
      {btn("Bold", "B", editor.isActive("bold"), () => editor.chain().focus().toggleBold().run())}
      {btn("Italic", "I", editor.isActive("italic"), () => editor.chain().focus().toggleItalic().run())}
      {btn("Strikethrough", "S̶", editor.isActive("strike"), () => editor.chain().focus().toggleStrike().run())}
      {btn("Bulleted list", "•", editor.isActive("bulletList"), () => editor.chain().focus().toggleBulletList().run())}
      {btn("Numbered list", "1.", editor.isActive("orderedList"), () => editor.chain().focus().toggleOrderedList().run())}
      {btn("Code", "</>", editor.isActive("code"), () => editor.chain().focus().toggleCode().run())}
      {btn("Link", "🔗", editor.isActive("link"), () => {
        const prev = editor.getAttributes("link").href as string | undefined;
        const url = window.prompt("URL", prev ?? "https://");
        if (url === null) return;
        if (url === "") editor.chain().focus().unsetLink().run();
        else if (/^(https?:|mailto:)/i.test(url)) editor.chain().focus().setLink({ href: url }).run();
      })}
    </div>
  );
}
