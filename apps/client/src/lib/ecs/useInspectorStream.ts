import { useEffect, useMemo, useRef, useState } from "react";

type InspectorSnapshot = {
  tick: number;
  entityCount: number;
  archetypes: { signature: string; entities: number; components: number[] }[];
  metrics: { name: string; stage: string; calls: number; totalMs: number; lastMs: number }[];
};

type InspectorOptions = {
  url: string; // ws://.../ws/ecs/inspector
  interval?: number; // ms; if set, auto-subscribe
  throttleMs?: number; // client-side ignore frequency
};

export function useInspectorStream(options: InspectorOptions) {
  const { url, interval, throttleMs = 50 } = options;
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [snapshot, setSnapshot] = useState<InspectorSnapshot | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const lastRef = useRef<number>(0);

  const subscribeMsg = useMemo(
    () => JSON.stringify({ type: "subscribe", interval }),
    [interval],
  );
  const pullMsg = JSON.stringify({ type: "pull" });

  useEffect(() => {
    const ws = new WebSocket(url);
    wsRef.current = ws;
    ws.onopen = () => {
      setConnected(true);
      if (interval) ws.send(subscribeMsg);
      else ws.send(pullMsg);
    };
    ws.onerror = (ev) => setError(ev);
    ws.onmessage = (ev) => {
      const now = Date.now();
      if (now - lastRef.current < throttleMs) return;
      lastRef.current = now;
      try {
        const parsed = JSON.parse(ev.data as string) as InspectorSnapshot;
        setSnapshot(parsed);
      } catch (err) {
        setError(err);
      }
    };
    ws.onclose = () => setConnected(false);
    return () => {
      if (ws.readyState === WebSocket.OPEN && interval) ws.send(JSON.stringify({ type: "unsubscribe" }));
      ws.close();
    };
  }, [url, subscribeMsg, interval, throttleMs]);

  const pull = () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(pullMsg);
  };

  return { connected, error, snapshot, pull };
}
