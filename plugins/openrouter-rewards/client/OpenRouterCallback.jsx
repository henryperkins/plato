import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { completeOpenRouterClaimFromUrl } from './claim-flow.js';

function backToSettings() {
  // Full reload back to /settings is fine: this page is a one-shot post-OAuth
  // surface and re-mounting Settings refreshes /status from the server.
  globalThis.window?.location.assign('/settings');
}

export default function OpenRouterCallback() {
  const [status, setStatus] = useState('pending');
  const [plaintext, setPlaintext] = useState('');
  const [errorText, setErrorText] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await completeOpenRouterClaimFromUrl();
      if (cancelled) return;
      if (!result) {
        setStatus('error');
        setErrorText('No OpenRouter sign-in in progress. Return to settings to claim.');
        return;
      }
      if (result.type === 'success') {
        setStatus('success');
        setPlaintext(result.plaintext || '');
      } else {
        setStatus('error');
        setErrorText(result.text || 'OpenRouter claim failed.');
      }
    })().catch(() => {
      if (cancelled) return;
      setStatus('error');
      setErrorText('OpenRouter claim failed.');
    });
    return () => { cancelled = true; };
  }, []);

  async function copy() {
    if (!plaintext) return;
    try {
      await navigator.clipboard.writeText(plaintext);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard write can fail in insecure contexts; the key is still visible on the page.
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 p-4">
      <Card>
        <CardHeader>
          <CardTitle>OpenRouter Rewards</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {status === 'pending' && (
            <p className="text-sm" role="status" aria-live="polite">
              Claiming your OpenRouter credits...
            </p>
          )}
          {status === 'success' && (
            <>
              <p className="text-sm">Your OpenRouter API key is ready. Copy it now — it won't be shown again.</p>
              <code className="block break-all rounded bg-muted p-2 text-xs">{plaintext}</code>
              <div className="flex flex-wrap gap-2">
                <Button onClick={copy} disabled={!plaintext} aria-live="polite">
                  {copied ? 'Copied' : 'Copy key'}
                </Button>
                <Button variant="outline" onClick={backToSettings}>
                  Back to settings
                </Button>
              </div>
            </>
          )}
          {status === 'error' && (
            <>
              <p className="text-sm text-destructive" role="alert">{errorText}</p>
              <Button variant="outline" onClick={backToSettings}>
                Back to settings
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
