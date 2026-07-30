import { useCallback, useState } from 'react';

/** A counter to drop into useAsync's deps array so a WS event can force a refetch. */
export function useRefreshSignal(): readonly [number, () => void] {
  const [signal, setSignal] = useState(0);
  const bump = useCallback(() => {
    setSignal((s) => s + 1);
  }, []);
  return [signal, bump];
}
