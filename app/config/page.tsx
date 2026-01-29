"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const OPENAI_STORAGE_KEY = "landsraad-openai-key";

export default function ConfigPage() {
  const [apiKey, setApiKey] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setApiKey(window.localStorage.getItem(OPENAI_STORAGE_KEY) ?? "");
  }, []);

  const handleSave = () => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(OPENAI_STORAGE_KEY, apiKey.trim());
    setStatusMessage("API-Key gespeichert.");
  };

  const handleReset = () => {
    if (typeof window === "undefined") return;
    const storedKey = window.localStorage.getItem(OPENAI_STORAGE_KEY);
    window.localStorage.clear();
    if (storedKey) {
      window.localStorage.setItem(OPENAI_STORAGE_KEY, storedKey);
    }
    setStatusMessage(
      "Lokaler Speicher wurde zurückgesetzt (API-Key beibehalten)."
    );
  };

  return (
    <main>
      <header>
        <span className="kicker">Konfiguration</span>
        <h1>OpenAI API-Key</h1>
        <p>
          Lege hier deinen API-Key ab. Er wird lokal im Browser gespeichert und
          für die Screenshot-Analyse verwendet.
        </p>
      </header>

      <section className="panel">
        <label htmlFor="api-key">OpenAI API-Key</label>
        <input
          id="api-key"
          type="password"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          placeholder="sk-..."
        />
        <div style={{ display: "flex", gap: "12px", marginTop: "12px" }}>
          <button onClick={handleSave}>Speichern</button>
          <button className="secondary" onClick={handleReset}>
            Lokalen Speicher zurücksetzen
          </button>
        </div>
        {statusMessage && <p className="small">{statusMessage}</p>}
      </section>

      <footer>
        <p>
          Zurück zum <Link href="/">Dashboard</Link>.
        </p>
      </footer>
    </main>
  );
}
