import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

export default function RevealKey({
  plaintext,
  intro = "Copy this key now; it won't be shown again.",
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(plaintext);
      setCopied(true);
    } catch {
      // Clipboard API can fail in insecure contexts; the key is still selectable on the page.
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-sm">{intro}</p>
      <button
        type="button"
        onClick={copy}
        aria-label="Copy OpenRouter API key"
        title={copied ? 'Copied!' : 'Tap to copy'}
        className="block w-full min-w-0 max-w-full cursor-pointer rounded bg-muted p-2 text-left transition-colors hover:bg-muted/80 active:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <code className="block w-full min-w-0 break-all wrap-anywhere font-mono text-xs">
          {plaintext}
        </code>
      </button>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={copy}>
          {copied ? 'Copied' : 'Copy key'}
        </Button>
        <span className="sr-only" role="status" aria-live="polite">
          {copied ? 'API key copied to clipboard' : ''}
        </span>
      </div>
    </div>
  );
}
