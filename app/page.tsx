"use client";

import { useState } from "react";

export default function HomePage() {
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [apiKey, setApiKey] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resultJson, setResultJson] = useState<any | null>(null);

  const handleFiles = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(ev.target.files || []).filter(
      (f) => f.type.startsWith("image/")
    );
    
    if (selectedFiles.length === 0) {
      setStatus("Bitte nur Bilder hochladen (JPG, PNG, etc.)");
      return;
    }

    setStatus("Laden Bilder...");
    setResultJson(null);
    const newPreviews: string[] = [];

    try {
      for (const file of selectedFiles) {
        const imageUrl = await fileToDataUrl(file);
        newPreviews.push(imageUrl);
      }

      setFiles(selectedFiles);
      setPreviews(newPreviews);
      setStatus(`${selectedFiles.length} Bild(er) geladen.`);
    } catch (error) {
      setStatus(`Fehler beim Laden: ${String(error)}`);
    }
  };

  const fileToDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (index: number) => {
    setFiles(files.filter((_, i) => i !== index));
    setPreviews(previews.filter((_, i) => i !== index));
  };

  const handleAnalyze = async () => {
    if (previews.length === 0) {
      setStatus("Bitte zuerst Bilder hochladen.");
      return;
    }
    if (!apiKey.trim()) {
      setStatus("API-Key erforderlich.");
      return;
    }

    setLoading(true);
    setStatus("Sende Bilder zur Analyse...");
    setResultJson(null);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          imageDataUrls: previews,
          apiKey: apiKey.trim(),
        }),
      });

      const data = await response.json();
      console.log("response: ", response);
      console.log("data: ", data);

      if (!response.ok) {
        setStatus(`Fehler: ${data?.error || "Unbekannter Fehler"}`);
        setResultJson(data);
      } else {
        setResultJson(data.result);
        setStatus("Analyse erfolgreich!");
      }
    } catch (err) {
      setStatus("Fehler: " + String(err));
      setResultJson({ error: String(err) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{ padding: 24, fontFamily: "Arial, sans-serif", maxWidth: 900 }}>
      <h1>Dune Landsraad Screenshot Parser</h1>
      <p style={{ color: "#666", marginBottom: 24 }}>
        Lade 1 oder mehrere Landsraad-Screenshots hoch und schicke sie zur Analyse.
      </p>

      <div style={{ marginBottom: 20, padding: 16, background: "#f5f5f5", borderRadius: 8 }}>
        <div style={{ marginBottom: 12 }}>
          <label>
            <strong>API-Key (Hugging Face):</strong>
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="hf_..."
            style={{
              display: "block",
              marginTop: 8,
              padding: 8,
              width: "100%",
              boxSizing: "border-box",
            }}
          />
          <p style={{ fontSize: 12, color: "#666", marginTop: 6 }}>
            Hugging Face API Token von https://huggingface.co/settings/tokens
          </p>
        </div>
      </div>

      <div style={{ marginBottom: 20, padding: 16, background: "#f9f9f9", borderRadius: 8 }}>
        <label>
          <strong>Bilder hochladen:</strong>
        </label>
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={handleFiles}
          style={{ display: "block", marginTop: 8 }}
        />
        <p style={{ fontSize: 12, color: "#666", marginTop: 6 }}>
          JPG, PNG und andere Bildformate
        </p>

        {previews.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <p style={{ fontWeight: "bold", marginBottom: 12 }}>
              {previews.length} Bild(er) geladen:
            </p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
                gap: 12,
              }}
            >
              {previews.map((dataUrl, index) => (
                <div
                  key={index}
                  style={{
                    position: "relative",
                    borderRadius: 4,
                    overflow: "hidden",
                    border: "1px solid #ddd",
                  }}
                >
                  <img
                    src={dataUrl}
                    alt={`preview-${index}`}
                    style={{
                      width: "100%",
                      height: 150,
                      objectFit: "cover",
                    }}
                  />
                  <div style={{ padding: 4, background: "#fff", textAlign: "center", fontSize: 12 }}>
                    Bild {index + 1}
                  </div>
                  <button
                    onClick={() => removeImage(index)}
                    style={{
                      position: "absolute",
                      top: 4,
                      right: 4,
                      background: "rgba(0,0,0,0.6)",
                      color: "white",
                      border: "none",
                      borderRadius: 4,
                      padding: "4px 8px",
                      cursor: "pointer",
                      fontSize: 12,
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div style={{ marginBottom: 20 }}>
        <button
          onClick={handleAnalyze}
          disabled={loading || previews.length === 0}
          style={{
            padding: "10px 20px",
            fontSize: 16,
            cursor: loading || previews.length === 0 ? "not-allowed" : "pointer",
            opacity: loading || previews.length === 0 ? 0.6 : 1,
          }}
        >
          {loading ? "Analysiere..." : "Analysieren"}
        </button>
      </div>

      {status && (
        <p
          style={{
            marginBottom: 20,
            padding: 12,
            background: resultJson?.error ? "#ffe0e0" : "#e0f0ff",
            color: resultJson?.error ? "#cc0000" : "#0066cc",
            borderRadius: 4,
          }}
        >
          {status}
        </p>
      )}

      {resultJson && (
        <div style={{ marginBottom: 20 }}>
          <h2>Ergebnis</h2>
          <pre
            style={{
              background: "#1e1e1e",
              color: "#00ff00",
              padding: 16,
              borderRadius: 4,
              overflowX: "auto",
              maxHeight: 500,
              overflowY: "auto",
            }}
          >
            {JSON.stringify(resultJson, null, 2)}
          </pre>
        </div>
      )}
    </main>
  );
}
