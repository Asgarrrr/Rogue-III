import type { CSSProperties } from "react";
import { useMemo, useState } from "react";

type DungeonResponse = {
  ok: boolean;
  checksum?: string;
  shareCode?: string;
  ascii?: string;
  rooms?: Array<{ id: number }>;
  connections?: Array<unknown>;
  error?: string;
  message?: string;
  config?: {
    algorithm: "cellular" | "bsp";
    width: number;
    height: number;
    roomCount: number;
    roomSizeRange: [number, number];
  };
};

const API_URL =
  (import.meta as { env: Record<string, string> }).env.VITE_API_URL ??
  "http://localhost:3001/api/dungeon";

const defaultConfig = {
  width: 60,
  height: 40,
  roomCount: 6,
  roomSizeRange: [5, 12] as [number, number],
  algorithm: "cellular" as const,
};

function App() {
  const [seed, setSeed] = useState("12345");
  const [shareCode, setShareCode] = useState("");
  const [config, setConfig] = useState(defaultConfig);
  const [ascii, setAscii] = useState("");
  const [checksum, setChecksum] = useState("");
  const [activeShare, setActiveShare] = useState("");
  const [status, setStatus] = useState("Prêt à sculpter un donjon.");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const summary = useMemo(() => {
    if (!checksum) return "";
    const rooms = (config.roomCount ?? 0).toString().padStart(2, "0");
    return `algo=${config.algorithm} rooms=${rooms} checksum=${checksum.slice(0, 8)}`;
  }, [checksum, config]);

  const randomSeed = () => {
    const next = Math.floor(Math.random() * 1_000_000_000);
    setSeed(String(next));
  };

  const generateDungeon = async () => {
    setIsLoading(true);
    setError("");
    setStatus("Génération en cours...");
    setCopied(false);
    try {
      const payload: Record<string, unknown> = {
        config,
      };

      if (shareCode.trim().length > 0) {
        payload.shareCode = shareCode.trim();
      } else {
        payload.seed = Number(seed) || 1;
      }

      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = (await res.json()) as DungeonResponse;
      if (!json.ok) {
        throw new Error(json.message || json.error || "Generation failed");
      }

      setAscii(json.ascii ?? "");
      setChecksum(json.checksum ?? "");
      setActiveShare(json.shareCode ?? "");
      setStatus("Génération réussie.");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Impossible de générer le donjon";
      setError(message);
      setStatus("Erreur lors de la génération.");
    } finally {
      setIsLoading(false);
    }
  };

  const copyShare = async () => {
    if (!activeShare) return;
    await navigator.clipboard.writeText(activeShare);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  const onInput = <K extends keyof typeof config>(key: K, value: number | string) => {
    setConfig((prev) => ({
      ...prev,
      [key]: typeof prev[key] === "number" ? Number(value) : value,
    }) as typeof config);
  };

  return (
    <div style={styles.shell}>
      <div style={styles.left}>
        <header style={styles.header}>
          <div>
            <div style={styles.logo}>ROGUE III</div>
            <div style={styles.subtitle}>ASCII generator · déterministe</div>
          </div>
          <div style={styles.tag}>{summary || "standby"}</div>
        </header>

        <div style={styles.formGrid}>
          <label style={styles.field}>
            <span>Seed</span>
            <div style={styles.row}>
              <input
                style={styles.input}
                value={seed}
                onChange={(e) => setSeed(e.target.value)}
                placeholder="12345"
              />
              <button style={styles.ghost} onClick={randomSeed} type="button">
                rnd
              </button>
            </div>
          </label>

          <label style={styles.field}>
            <span>Code de partage (optionnel)</span>
            <input
              style={styles.input}
              value={shareCode}
              onChange={(e) => setShareCode(e.target.value)}
              placeholder="colle un code ici"
            />
          </label>

          <label style={styles.field}>
            <span>Algorithme</span>
            <select
              style={styles.input}
              value={config.algorithm}
              onChange={(e) =>
                setConfig((prev) => ({
                  ...prev,
                  algorithm: e.target.value as "cellular" | "bsp",
                  roomCount: e.target.value === "bsp" ? Math.max(prev.roomCount, 6) : prev.roomCount,
                }))
              }
            >
              <option value="cellular">cellular</option>
              <option value="bsp">bsp</option>
            </select>
          </label>

          <div style={styles.split}>
            <label style={styles.field}>
              <span>Largeur</span>
              <input
                style={styles.input}
                type="number"
                min={20}
                max={200}
                value={config.width}
                onChange={(e) => onInput("width", e.target.valueAsNumber)}
              />
            </label>
            <label style={styles.field}>
              <span>Hauteur</span>
              <input
                style={styles.input}
                type="number"
                min={20}
                max={200}
                value={config.height}
                onChange={(e) => onInput("height", e.target.valueAsNumber)}
              />
            </label>
          </div>

          <div style={styles.split}>
            <label style={styles.field}>
              <span>Rooms</span>
              <input
                style={styles.input}
                type="number"
                min={0}
                max={40}
                value={config.roomCount}
                onChange={(e) => onInput("roomCount", e.target.valueAsNumber)}
              />
            </label>
            <label style={styles.field}>
              <span>Taille min</span>
              <input
                style={styles.input}
                type="number"
                min={3}
                max={30}
                value={config.roomSizeRange[0]}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    roomSizeRange: [e.target.valueAsNumber, prev.roomSizeRange[1]],
                  }))
                }
              />
            </label>
            <label style={styles.field}>
              <span>Taille max</span>
              <input
                style={styles.input}
                type="number"
                min={3}
                max={60}
                value={config.roomSizeRange[1]}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    roomSizeRange: [prev.roomSizeRange[0], e.target.valueAsNumber],
                  }))
                }
              />
            </label>
          </div>

          <div style={styles.actions}>
            <button style={styles.primary} onClick={generateDungeon} disabled={isLoading}>
              {isLoading ? "..." : "Générer"}
            </button>
            <div style={styles.status}>{status}</div>
          </div>
          {error && <div style={styles.error}>⚠ {error}</div>}
          {activeShare && (
            <div style={styles.shareBox}>
              <div>Code de partage</div>
              <div style={styles.shareRow}>
                <code style={styles.code}>{activeShare}</code>
                <button style={styles.ghost} onClick={copyShare} type="button">
                  {copied ? "copié" : "copier"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={styles.right}>
        <div style={styles.asciiHeader}>
          <div>Grille ( # = mur, . = sol )</div>
          <div style={styles.meta}>{checksum ? `checksum ${checksum}` : "—"}</div>
        </div>
        <pre style={styles.ascii}>{ascii || "Clique sur Générer pour voir la carte."}</pre>
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  shell: {
    display: "grid",
    gridTemplateColumns: "360px 1fr",
    gap: "24px",
    padding: "32px",
    minHeight: "100vh",
  },
  left: {
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "12px",
    padding: "20px",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  right: {
    background: "rgba(255,255,255,0.02)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "12px",
    padding: "16px",
    display: "flex",
    flexDirection: "column",
    minHeight: "60vh",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
  },
  logo: { fontWeight: 700, letterSpacing: "0.08em", color: "#8ef", fontSize: "14px" },
  subtitle: { color: "#8a8fa3", fontSize: "12px" },
  tag: {
    fontSize: "12px",
    padding: "6px 8px",
    borderRadius: "8px",
    border: "1px solid rgba(255,255,255,0.1)",
    color: "#c7cad9",
  },
  formGrid: { display: "flex", flexDirection: "column", gap: "12px" },
  field: { display: "flex", flexDirection: "column", gap: "6px", color: "#c7cad9" },
  input: {
    background: "#0b0d12",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: "8px",
    padding: "10px 12px",
    color: "#e4e4e4",
    fontFamily: "inherit",
  },
  row: { display: "flex", gap: "8px", alignItems: "center" },
  split: {
    display: "grid",
    gap: "10px",
    gridTemplateColumns: "repeat(auto-fit, minmax(90px, 1fr))",
  },
  actions: { display: "flex", alignItems: "center", gap: "12px" },
  primary: {
    background: "linear-gradient(120deg, #1f7cff, #5fe3ff)",
    color: "#0a0c10",
    border: "none",
    borderRadius: "10px",
    padding: "10px 16px",
    fontWeight: 700,
    cursor: "pointer",
  },
  ghost: {
    background: "rgba(255,255,255,0.08)",
    color: "#dfe3f0",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: "8px",
    padding: "8px 10px",
    cursor: "pointer",
  },
  status: { color: "#8a8fa3", fontSize: "12px" },
  error: {
    color: "#ff9a9a",
    fontSize: "12px",
    border: "1px solid rgba(255,0,0,0.2)",
    borderRadius: "8px",
    padding: "8px",
  },
  shareBox: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    padding: "10px",
    borderRadius: "10px",
    border: "1px dashed rgba(255,255,255,0.1)",
  },
  shareRow: { display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" },
  code: {
    background: "#0b0d12",
    padding: "6px 8px",
    borderRadius: "6px",
    border: "1px solid rgba(255,255,255,0.1)",
    fontSize: "12px",
    wordBreak: "break-all",
  },
  asciiHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    color: "#9aa0b5",
    marginBottom: "8px",
  },
  meta: { fontSize: "12px", color: "#7b8095" },
  ascii: {
    flex: 1,
    margin: 0,
    whiteSpace: "pre",
    overflow: "auto",
    background: "#0b0d12",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "10px",
    padding: "12px",
    fontSize: "12px",
    color: "#cdd0dd",
    lineHeight: 1.2,
  },
};

export default App;
