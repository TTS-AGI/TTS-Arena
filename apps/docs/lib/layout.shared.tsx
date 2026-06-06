import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import { AudioLines } from "lucide-react";
import { appName, arenaUrl, gitConfig } from "./shared";

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <>
          <AudioLines className="text-fd-primary size-5" />
          <span className="font-semibold">{appName}</span>
        </>
      ),
    },
    links: [
      {
        text: "Open the Arena",
        url: arenaUrl,
        external: true,
      },
    ],
    githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
  };
}
