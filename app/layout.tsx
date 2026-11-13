import type { Metadata } from "next";
import Script from "next/script";
import { ThemeProvider } from "@/components/theme-provider";
import "react-day-picker/style.css";
import "@xyflow/react/dist/style.css";
import "katex/dist/katex.min.css";
import "./globals.css";
import "./reader.css";
import "./design-system.css";
import "./ui.css";
import "./chat-reader.css";
import "./course-analysis-parallel.css";
import "./material-status.css";
import "./markdown.css";
import "./sidebar-profile.css";
import "./workspace-background.css";
import "./accent-theme.css";
import "./night-theme.css";
import "./mobile-workspace.css";
import "./reader-focus.css";

export const metadata: Metadata = { title: "studio.", description: "Le tue slide, spiegate. Uno spazio locale per studiare PDF, capire i concetti e tradurre le parole." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="it" suppressHydrationWarning><head><Script id="studio-theme-init" strategy="beforeInteractive">{`try{var p=localStorage.getItem('studio-theme'),h=new Date().getHours();document.documentElement.dataset.theme=(p==='dark'||(p==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches)||(p==='adaptive'&&(h>=20||h<8)))?'dark':'light'}catch{}`}</Script></head><body><ThemeProvider>{children}</ThemeProvider></body></html>;
}
