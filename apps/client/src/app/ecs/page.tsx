"use client";

import { useMemo, useState } from "react";
import { useInspectorStream } from "@/lib/ecs/useInspectorStream";
import { useSnapshotStream } from "@/lib/ecs/useSnapshotStream";

const DEFAULT_WS =
  typeof window !== "undefined"
    ? `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/ws/ecs`
    : "ws://localhost:3000/ws/ecs";

export default function EcsPage() {
  const [baseUrl, setBaseUrl] = useState(DEFAULT_WS);
  const [encoding, setEncoding] = useState<"framed-json" | "binary-packed">("binary-packed");
  const [compress, setCompress] = useState<"gzip" | "brotli" | undefined>("gzip");
  const snapshotUrl = useMemo(() => `${baseUrl}/snapshot`, [baseUrl]);
  const inspectorUrl = useMemo(() => `${baseUrl}/inspector`, [baseUrl]);

  const { snapshot, connected: snapConnected, error: snapError, request } = useSnapshotStream({
    url: snapshotUrl,
    encoding,
    compress,
  });

  const { snapshot: inspector, connected: inspConnected, error: inspError, pull } = useInspectorStream({
    url: inspectorUrl,
    interval: 250,
  });

  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold">ECS Live</h1>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm text-gray-600">
            WS base:
            <input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              className="ml-2 rounded border px-2 py-1 text-sm"
              placeholder="ws://localhost:3000/ws/ecs"
            />
          </label>
          <label className="text-sm text-gray-600">
            Encoding:
            <select
              value={encoding}
              onChange={(e) => setEncoding(e.target.value as any)}
              className="ml-2 rounded border px-2 py-1 text-sm"
            >
              <option value="binary-packed">binary-packed</option>
              <option value="framed-json">framed-json</option>
            </select>
          </label>
          <label className="text-sm text-gray-600">
            Compress:
            <select
              value={compress ?? ""}
              onChange={(e) => setCompress((e.target.value || undefined) as any)}
              className="ml-2 rounded border px-2 py-1 text-sm"
            >
              <option value="">none</option>
              <option value="gzip">gzip</option>
              <option value="brotli">brotli</option>
            </select>
          </label>
          <span className="text-xs text-gray-500">Snapshot: {snapshotUrl}</span>
          <span className="text-xs text-gray-500">Inspector: {inspectorUrl}</span>
        </div>
        <div className="flex gap-3 text-sm">
          <StatusBadge label="Snapshot" ok={snapConnected} />
          <StatusBadge label="Inspector" ok={inspConnected} />
          {snapError && <span className="text-red-600">Snapshot error: {String(snapError)}</span>}
          {inspError && <span className="text-red-600">Inspector error: {String(inspError)}</span>}
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card title="Snapshot">
          <div className="flex items-center gap-2 text-sm">
            <button
              className="rounded bg-indigo-600 px-3 py-1 text-white hover:bg-indigo-700"
              onClick={request}
            >
              Pull
            </button>
            <span className="text-gray-600">
              Tick: {snapshot?.tick ?? "-"} | Entities: {snapshot?.entityCount ?? "-"}
            </span>
          </div>
          <pre className="mt-3 max-h-80 overflow-auto rounded bg-gray-900 p-3 text-xs text-gray-100">
            {snapshot ? formatSnapshot(snapshot) : "No snapshot yet."}
          </pre>
        </Card>

        <Card title="Inspector">
          <div className="flex items-center gap-2 text-sm">
            <button
              className="rounded bg-slate-600 px-3 py-1 text-white hover:bg-slate-700"
              onClick={pull}
            >
              Pull now
            </button>
            <span className="text-gray-600">
              Tick: {inspector?.tick ?? "-"} | Entities: {inspector?.entityCount ?? "-"}
            </span>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <h3 className="font-semibold text-sm text-gray-200">Archetypes</h3>
              <pre className="mt-2 max-h-60 overflow-auto rounded bg-gray-900 p-3 text-xs text-gray-100">
                {inspector?.archetypes ? JSON.stringify(inspector.archetypes, null, 2) : "No data"}
              </pre>
            </div>
            <div>
              <h3 className="font-semibold text-sm text-gray-200">Metrics</h3>
              <pre className="mt-2 max-h-60 overflow-auto rounded bg-gray-900 p-3 text-xs text-gray-100">
                {inspector?.metrics ? JSON.stringify(inspector.metrics, null, 2) : "No data"}
              </pre>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function StatusBadge({ label, ok }: { label: string; ok: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs ${
        ok ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-600"
      }`}
    >
      <span className={`h-2 w-2 rounded-full ${ok ? "bg-green-500" : "bg-gray-500"}`} />
      {label}
    </span>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="mb-2 text-lg font-semibold">{title}</h2>
      {children}
    </div>
  );
}

function formatSnapshot(snapshot: any) {
  if (snapshot.encoding === "framed-json") {
    return JSON.stringify(snapshot.state, null, 2);
  }
  // binary-packed: show header + first bytes
  const bytes = snapshot.body as Uint8Array | undefined;
  const preview =
    bytes && bytes.length > 0
      ? Array.from(bytes.slice(0, 48))
          .map((b: number) => b.toString(16).padStart(2, "0"))
          .join(" ")
      : "empty";
  return `encoding: ${snapshot.encoding}
tick: ${snapshot.tick}
entityCount: ${snapshot.entityCount}
body(bytes): ${bytes?.length ?? "?"}
preview: ${preview}`;
}
