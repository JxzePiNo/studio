"use client";

import { createContext, useContext, useEffect, useState, type ComponentProps, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Slot } from "@radix-ui/react-slot";
import { PanelLeft, X } from "lucide-react";
import { clsx } from "clsx";
import { Button } from "./button";

const SidebarContext = createContext<{ openMobile: boolean; setOpenMobile: (open: boolean) => void } | null>(null);
function useSidebar() {
  const value = useContext(SidebarContext);
  if (!value) throw new Error("Sidebar richiede SidebarProvider.");
  return value;
}
export function SidebarProvider({ openMobile, onOpenMobileChange, children }: { openMobile: boolean; onOpenMobileChange: (open: boolean) => void; children: ReactNode }) {
  return <SidebarContext.Provider value={{ openMobile, setOpenMobile: onOpenMobileChange }}>{children}</SidebarContext.Provider>;
}
export function Sidebar({ children, className, ...props }: ComponentProps<"aside">) {
  const { openMobile, setOpenMobile } = useSidebar();
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 700px)");
    const update = () => setMobile(query.matches);
    update(); query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  if (mobile) return <Dialog.Root open={openMobile} onOpenChange={setOpenMobile}><Dialog.Portal><Dialog.Overlay className="ui-sidebar-overlay" /><Dialog.Content data-slot="sidebar" data-mobile="true" className={clsx("sidebar is-open ui-sidebar-sheet", className)} aria-describedby={undefined}><Dialog.Title className="sr-only">Navigazione Studio</Dialog.Title><Dialog.Close asChild><Button variant="ghost" size="icon" className="ui-sidebar-close" aria-label="Chiudi menu"><X size={18} /></Button></Dialog.Close>{children}</Dialog.Content></Dialog.Portal></Dialog.Root>;
  return <aside data-slot="sidebar" data-variant="inset" className={clsx("sidebar", className)} {...props}>{children}</aside>;
}
export function SidebarHeader({ className, ...props }: ComponentProps<"div">) { return <div data-slot="sidebar-header" className={clsx("ui-sidebar-header", className)} {...props} />; }
export function SidebarContent({ className, ...props }: ComponentProps<"div">) { return <div data-slot="sidebar-content" className={clsx("ui-sidebar-content", className)} {...props} />; }
export function SidebarFooter({ className, ...props }: ComponentProps<"div">) { return <div data-slot="sidebar-footer" className={clsx("sidebar-bottom", className)} {...props} />; }
export function SidebarMenu({ className, ...props }: ComponentProps<"ul">) { return <ul data-slot="sidebar-menu" className={clsx("ui-sidebar-menu", className)} {...props} />; }
export function SidebarMenuItem(props: ComponentProps<"li">) { return <li data-slot="sidebar-menu-item" {...props} />; }
export function SidebarMenuButton({ asChild, isActive, className, ...props }: ComponentProps<"button"> & { asChild?: boolean; isActive?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return <Comp data-slot="sidebar-menu-button" data-active={isActive} className={clsx("ui-sidebar-menu-button", className)} {...(!asChild ? { type: "button" as const } : {})} {...props} />;
}
export function SidebarTrigger({ className, onClick, ...props }: ComponentProps<typeof Button>) {
  const { openMobile, setOpenMobile } = useSidebar();
  return <Button variant="ghost" size="icon" className={clsx("mobile-menu standalone-menu", className)} aria-label="Apri menu" aria-expanded={openMobile} onClick={event => { onClick?.(event); setOpenMobile(!openMobile); }} {...props}><PanelLeft size={20} /></Button>;
}
