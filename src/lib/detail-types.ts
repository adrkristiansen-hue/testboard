import type { RtDoc } from "./richtext";
import type { ItemView } from "./types";

export type LinkKind = "PARENT" | "CHILD" | "RELATED" | "BLOCKS" | "BLOCKED_BY" | "DUPLICATE_OF" | "DUPLICATED_BY";
export const ADDABLE_LINK_KINDS: LinkKind[] = ["PARENT", "CHILD", "RELATED", "BLOCKS", "BLOCKED_BY", "DUPLICATE_OF", "DUPLICATED_BY"];

export interface LinkedItem {
  kind: LinkKind;
  item: { id: number; title: string; state: string; typeId: string; assignedToId: string | null };
}

export interface CommentView {
  id: string;
  authorId: string;
  body: RtDoc;
  createdAt: string;
  editedAt: string | null;
  reactions: { emoji: string; userIds: string[] }[];
}

export interface HistoryRev {
  rev: number;
  changedById: string;
  changedAt: string;
  changes: { field: string; oldValue: string | null; newValue: string | null }[];
}

export interface AttachmentView {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  createdAt: string;
  uploadedById: string;
  commentId: string | null;
}

export interface ItemDetail {
  projectId: string;
  item: ItemView & { description: RtDoc | null; changedById: string };
  comments: CommentView[];
  history: HistoryRev[];
  links: LinkedItem[];
  attachments: AttachmentView[];
  following: boolean;
}

export const REACTION_EMOJIS = ["👍", "👎", "🎉", "👀", "❤️", "😕"];
