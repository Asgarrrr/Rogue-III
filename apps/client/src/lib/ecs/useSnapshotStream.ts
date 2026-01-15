import { useEffect, useMemo, useRef, useState } from "react";
import { decodeSnapshot, type DecodedSnapshot } from "@rogue/contracts";

type SnapshotStreamOptions = {
  url: string; // ws endpoint (e.g., ws://.../ws/ecs/snapshot)
  encoding?: "framed-json" | "binary-packed";
  compress?: "gzip" | "brotli";
  autoStepTicks?: number;
};

export function useSnapshotStream(options: SnapshotStreamOptions) {
  const { url, encoding = "framed-json", compress, autoStepTicks } = options;
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [last, setLast] = useState<DecodedSnapshot | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const payload = useMemo(
    () =>
      JSON.stringify({
        type: "snapshot",
        encoding,
        compress,
        ...(autoStepTicks ? { step: { ticks: autoStepTicks } } : {}),
      }),
    [encoding, compress, autoStepTicks],
  );

  useEffect(() => {
    const ws = new WebSocket(url);
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;
    setError(null);
    ws.onopen = () => {
      setConnected(true);
      ws.send(payload);
    };
    ws.onerror = (ev) => {
      setError(ev);
    };
    ws.onmessage = async (ev) => {
      try {
        const decoded = await decodeSnapshot(ev.data as ArrayBuffer);
        setLast(decoded);
      } catch (err) {
        setError(err);
      }
    };
    ws.onclose = () => {
      setConnected(false);
    };
    return () => {
      ws.close();
    };
  }, [url, payload]);

  const request = () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(payload);
  };

  return { connected, error, snapshot: last, request };
}
