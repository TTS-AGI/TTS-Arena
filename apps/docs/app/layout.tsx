import type { Metadata } from "next";
import { RootProvider } from "fumadocs-ui/provider/next";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import "./global.css";
import { Inter } from "next/font/google";
import { source } from "@/lib/source";
import { baseOptions } from "@/lib/layout.shared";

const inter = Inter({
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://docs.ttsarena.org"),
  title: {
    default: "TTS Arena Docs",
    template: "%s · TTS Arena Docs",
  },
  description:
    "Documentation for TTS Arena — the crowdsourced text-to-speech benchmark.",
};

export default function Layout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={inter.className} suppressHydrationWarning>
      <body className="flex min-h-screen flex-col">
        <RootProvider>
          {/* Docs are the whole site — the DocsLayout (sidebar + nav) wraps
              everything at the root; there is no separate homepage. */}
          <DocsLayout tree={source.getPageTree()} {...baseOptions()}>
            {children}
          </DocsLayout>
        </RootProvider>
      </body>
    </html>
  );
}
