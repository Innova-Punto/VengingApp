"use client";

import { useState } from "react";

export function ScreenshotSlot({
  url,
  file,
  alt,
}: {
  url: string;
  file: string;
  alt: string;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <figure className="space-y-1">
      <div className="overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50">
        {failed ? (
          <div className="flex h-40 max-w-md items-center justify-center bg-zinc-100 px-3 text-center text-xs text-zinc-500">
            📷 Captura pendiente:{" "}
            <code className="ml-1 break-all">{file}</code>
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={alt}
            className="block w-full max-w-md"
            loading="lazy"
            onError={() => setFailed(true)}
          />
        )}
      </div>
      <figcaption className="font-mono text-[10px] text-zinc-400">
        {file}
      </figcaption>
    </figure>
  );
}
