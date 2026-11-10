"use client";

import { useRef, type ReactElement } from "react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import { Archive, ArchiveRestore, FolderOpen, Pencil, Settings2, Trash2 } from "lucide-react";
import type { ExamFolder } from "@/lib/types";

export type CourseAction = "open" | "settings" | "rename" | "archive" | "delete";

export function CourseContextMenu({ folder, onAction, children, disabled = false, deleteDisabled = false }: {
  folder: ExamFolder;
  onAction: (action: CourseAction) => void;
  children: ReactElement;
  disabled?: boolean;
  deleteDisabled?: boolean;
}) {
  const openingDialog = useRef(false);
  function choose(action: CourseAction) {
    openingDialog.current = action !== "open";
    onAction(action);
  }
  return <ContextMenu.Root>
    <ContextMenu.Trigger asChild disabled={disabled}>{children}</ContextMenu.Trigger>
    <ContextMenu.Portal><ContextMenu.Content className="material-menu-content" onClick={event => event.stopPropagation()} onCloseAutoFocus={event => {
      if (openingDialog.current) event.preventDefault();
      openingDialog.current = false;
    }}>
      <ContextMenu.Item className="material-menu-item" onSelect={() => choose("open")}><FolderOpen size={15} /> Apri corso</ContextMenu.Item>
      <ContextMenu.Item className="material-menu-item" onSelect={() => choose("settings")}><Settings2 size={15} /> Impostazioni</ContextMenu.Item>
      <ContextMenu.Item className="material-menu-item" onSelect={() => choose("rename")}><Pencil size={15} /> Rinomina</ContextMenu.Item>
      <ContextMenu.Separator className="material-menu-separator" />
      <ContextMenu.Item className="material-menu-item" onSelect={() => choose("archive")}>{folder.archived ? <ArchiveRestore size={15} /> : <Archive size={15} />}{folder.archived ? "Ripristina" : "Archivia"}</ContextMenu.Item>
      <ContextMenu.Item className="material-menu-item" disabled={deleteDisabled} onSelect={() => choose("delete")}><Trash2 size={15} /> Elimina corso</ContextMenu.Item>
    </ContextMenu.Content></ContextMenu.Portal>
  </ContextMenu.Root>;
}
