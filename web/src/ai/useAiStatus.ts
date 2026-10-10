import { useEffect, useState } from 'react';

import { ai, aiBaseUrl } from '../api/client.ts';

export type AiFeatures = ReadonlySet<string>;

// Asked once per session, by whichever screen asks first, and kept here.
let asked: Promise<AiFeatures | null> | null = null;

function ask(): Promise<AiFeatures | null> {
  if (!aiBaseUrl()) return Promise.resolve(null);
  asked ??= ai
    .get('/status')
    .then((status) => new Set(status.features) as AiFeatures)
    // Off (404 AI_DISABLED), unreachable or anything else: no AI element renders
    // and the screen is the product without AI.
    .catch(() => null);
  return asked;
}

/** The AI features this deployment serves, or null while unknown, off or unreachable. */
export function useAiStatus(): AiFeatures | null {
  const [features, setFeatures] = useState<AiFeatures | null>(null);
  useEffect(() => {
    let live = true;
    void ask().then((found) => {
      if (live) setFeatures(found);
    });
    return () => {
      live = false;
    };
  }, []);
  return features;
}

/** For the browser checks only: forget the session's answer. */
export function forgetAiStatus(): void {
  asked = null;
}
