// Live signals from the server (GET /signals): a phone chose a person and is
// telling about them, or a story was saved. The handlers may change between
// renders; the connection stays open for the page's lifetime.
import { useEffect, useRef } from 'react';
import { listenSignals } from './signalClient';
import type { Signal } from './story';

type Handlers = {
  select: (key: string, name: string | null) => void;
  storySaved: (signal: Extract<Signal, { type: 'story-saved' }>) => void;
};

export function useSignals(handlers: Handlers) {
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });
  useEffect(
    () =>
      listenSignals((s) => {
        if (s.type === 'select') latest.current.select(s.key, s.name);
        else if (s.type === 'story-saved') latest.current.storySaved(s);
      }),
    [],
  );
}
