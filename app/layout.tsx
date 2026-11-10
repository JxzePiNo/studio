import type { Metadata } from "next";
import "react-day-picker/style.css";
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

export const metadata: Metadata = { title: "Margine — Lo spazio per capire", description: "Le tue slide, spiegate. Uno spazio locale per studiare PDF, capire i concetti e tradurre le parole." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="it"><body>{children}</body></html>;
}
