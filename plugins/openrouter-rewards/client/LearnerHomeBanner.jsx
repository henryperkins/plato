import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { completeOpenRouterClaimFromUrl } from './claim-flow.js';

export default function LearnerHomeBanner() {
  const [message, setMessage] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await completeOpenRouterClaimFromUrl();
      if (!cancelled && result) setMessage(result);
    })();
    return () => { cancelled = true; };
  }, []);

  if (!message) return null;
  return (
    <Card className="mb-3">
      <CardContent className="space-y-2">
        {message.type === 'success' ? (
          <>
            <p className="text-sm">Your OpenRouter key is ready. This key is shown once in plato.</p>
            <code className="block break-all rounded bg-muted p-2 text-xs">{message.plaintext}</code>
          </>
        ) : (
          <p className="text-sm text-destructive" role="alert">{message.text}</p>
        )}
      </CardContent>
    </Card>
  );
}
