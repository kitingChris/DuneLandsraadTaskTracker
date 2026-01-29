"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Reward = {
  points: number;
  reward: string;
};

type HouseTask = {
  house: string;
  item: string;
  pointsPerItem: number;
  rewards: Reward[];
  contributionPoints: number;
  screenshotDataUrl?: string;
  lastUpdated?: string;
};

type WeekData = {
  weekKey: string;
  houses: Record<string, HouseTask>;
};

const DEFAULT_HOUSES = [
  "Atreides",
  "Harkonnen",
  "Corrino",
  "Varota",
  "Wallach",
  "Imota",
];

const emptyTask = (house: string): HouseTask => ({
  house,
  item: "",
  pointsPerItem: 0,
  rewards: [],
  contributionPoints: 0,
});

const getWeekKey = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const days = Math.floor(
    (now.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)
  );
  const week = Math.ceil((days + start.getDay() + 1) / 7);
  return `${now.getFullYear()}-W${week}`;
};

const STORAGE_PREFIX = "landsraad-week";
const OPENAI_STORAGE_KEY = "landsraad-openai-key";

const loadWeekData = (weekKey: string): WeekData => {
  if (typeof window === "undefined") {
    return { weekKey, houses: {} };
  }
  const stored = window.localStorage.getItem(`${STORAGE_PREFIX}-${weekKey}`);
  if (!stored) {
    return { weekKey, houses: {} };
  }
  try {
    return JSON.parse(stored) as WeekData;
  } catch {
    return { weekKey, houses: {} };
  }
};

const saveWeekData = (data: WeekData) => {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(
    `${STORAGE_PREFIX}-${data.weekKey}`,
    JSON.stringify(data)
  );
};

const houseLabel = (house: string) => `Haus ${house}`;

export default function HomePage() {
  const weekKey = useMemo(() => getWeekKey(), []);
  const [weekData, setWeekData] = useState<WeekData>({
    weekKey,
    houses: {},
  });
  const [selectedHouse, setSelectedHouse] = useState("Varota");
  const [uploading, setUploading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [openAiKey, setOpenAiKey] = useState<string | null>(null);

  useEffect(() => {
    const loaded = loadWeekData(weekKey);
    const enriched: WeekData = {
      weekKey,
      houses: DEFAULT_HOUSES.reduce<Record<string, HouseTask>>((acc, house) => {
        acc[house] = loaded.houses[house] ?? emptyTask(house);
        return acc;
      }, {}),
    };
    setWeekData(enriched);
  }, [weekKey]);

  useEffect(() => {
    if (!weekData.weekKey) return;
    saveWeekData(weekData);
  }, [weekData]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setOpenAiKey(window.localStorage.getItem(OPENAI_STORAGE_KEY));
  }, []);

  const updateHouse = (house: string, changes: Partial<HouseTask>) => {
    setWeekData((prev) => ({
      ...prev,
      houses: {
        ...prev.houses,
        [house]: {
          ...prev.houses[house],
          ...changes,
        },
      },
    }));
  };

  const handleRewardChange = (
    house: string,
    index: number,
    key: keyof Reward,
    value: string
  ) => {
    const current = weekData.houses[house]?.rewards ?? [];
    const next = current.map((reward, idx) =>
      idx === index
        ? {
            ...reward,
            [key]: key === "points" ? Number(value) : value,
          }
        : reward
    );
    updateHouse(house, { rewards: next });
  };

  const addReward = (house: string) => {
    const current = weekData.houses[house]?.rewards ?? [];
    updateHouse(house, {
      rewards: [...current, { points: 0, reward: "" }],
    });
  };

  const removeReward = (house: string, index: number) => {
    const current = weekData.houses[house]?.rewards ?? [];
    updateHouse(house, {
      rewards: current.filter((_, idx) => idx !== index),
    });
  };

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setStatusMessage(null);

    const fileReader = new FileReader();
    fileReader.onload = async () => {
      const dataUrl = fileReader.result?.toString();
      if (!dataUrl) {
        setUploading(false);
        setStatusMessage("Screenshot konnte nicht geladen werden.");
        return;
      }

      updateHouse(selectedHouse, {
        screenshotDataUrl: dataUrl,
        lastUpdated: new Date().toISOString(),
      });

      const body = new FormData();
      body.append("house", selectedHouse);
      body.append("screenshot", file);

      try {
        const headers = new Headers();
        if (openAiKey) {
          headers.set("x-openai-key", openAiKey);
        }
        const response = await fetch("/api/analyze", {
          method: "POST",
          headers,
          body,
        });
        const payload = await response.json();
        if (response.ok && payload?.task) {
          updateHouse(selectedHouse, {
            item: payload.task.item ?? "",
            pointsPerItem: payload.task.pointsPerItem ?? 0,
            rewards: payload.task.rewards ?? [],
            lastUpdated: new Date().toISOString(),
          });
          setStatusMessage("Analyse erfolgreich gespeichert.");
        } else {
          setStatusMessage(
            payload?.error ??
              "Analyse fehlgeschlagen. Bitte Daten manuell ergänzen."
          );
        }
      } catch (error) {
        setStatusMessage("Verbindung zur Analyse fehlgeschlagen.");
      } finally {
        setUploading(false);
      }
    };
    fileReader.readAsDataURL(file);
  };

  const activeTask = weekData.houses[selectedHouse];

  return (
    <main>
      <header>
        <span className="kicker">Landsraad Term {weekKey}</span>
        <h1>Landsraad Task Tracker</h1>
        <p>
          Lade den Wochenscreenshot pro Haus hoch, lass ihn von ChatGPT
          auswerten und speichere deine aktuellen Contribution Points direkt im
          Browser. Jede Woche wird automatisch separat im lokalen Speicher
          geführt.
        </p>
      </header>

      <section className="panel">
        <div className="grid">
          <div>
            <h2>Screenshot Analyse</h2>
            <p className="small">
              Wähle ein Haus, lade den Screenshot hoch und aktualisiere die
              Taskdaten. Falls die API nicht konfiguriert ist, kannst du die
              Felder manuell befüllen.
            </p>
            <label htmlFor="house-select">Haus auswählen</label>
            <select
              id="house-select"
              value={selectedHouse}
              onChange={(event) => setSelectedHouse(event.target.value)}
            >
              {DEFAULT_HOUSES.map((house) => (
                <option key={house} value={house}>
                  {houseLabel(house)}
                </option>
              ))}
            </select>

            <label htmlFor="screenshot">Screenshot hochladen</label>
            <input
              id="screenshot"
              type="file"
              accept="image/*"
              onChange={handleUpload}
            />
            <div className="badge">
              <span>ChatGPT Analyse</span>
              <span>{uploading ? "läuft" : "bereit"}</span>
            </div>
            {statusMessage && <p className="small">{statusMessage}</p>}
            {activeTask?.screenshotDataUrl && (
              <img
                className="preview"
                src={activeTask.screenshotDataUrl}
                alt={`Screenshot für ${selectedHouse}`}
              />
            )}
          </div>

          <div>
            <h2>Task Details bearbeiten</h2>
            <label>Gesuchtes Item</label>
            <input
              value={activeTask?.item ?? ""}
              onChange={(event) =>
                updateHouse(selectedHouse, { item: event.target.value })
              }
              placeholder="z.B. Regis Drillshot FK7"
            />
            <label>Contribution Points pro Item</label>
            <input
              type="number"
              value={activeTask?.pointsPerItem ?? 0}
              onChange={(event) =>
                updateHouse(selectedHouse, {
                  pointsPerItem: Number(event.target.value),
                })
              }
            />
            <label>Aktuelle Contribution Points</label>
            <input
              type="number"
              value={activeTask?.contributionPoints ?? 0}
              onChange={(event) =>
                updateHouse(selectedHouse, {
                  contributionPoints: Number(event.target.value),
                })
              }
            />
            <p className="small">
              Letztes Update: {activeTask?.lastUpdated ?? "Noch nicht gesetzt"}
            </p>
          </div>
        </div>
      </section>

      <section className="panel">
        <h2>Belohnungen pro Haus</h2>
        <div className="grid">
          {DEFAULT_HOUSES.map((house) => {
            const task = weekData.houses[house];
            return (
              <div key={house} className="card">
                <h3>{houseLabel(house)}</h3>
                <p className="small">
                  Gesuchtes Item: {task?.item || "Noch nicht erfasst"}
                </p>
                <p className="small">
                  Punkte pro Item: {task?.pointsPerItem || 0}
                </p>
                <p className="small">
                  Aktuelle Contribution Points: {task?.contributionPoints || 0}
                </p>
                <div className="reward-list">
                  {(task?.rewards ?? []).map((reward, index) => (
                    <div key={`${house}-${index}`} className="reward-row">
                      <input
                        type="number"
                        value={reward.points}
                        onChange={(event) =>
                          handleRewardChange(
                            house,
                            index,
                            "points",
                            event.target.value
                          )
                        }
                        placeholder="Punkte"
                      />
                      <input
                        value={reward.reward}
                        onChange={(event) =>
                          handleRewardChange(
                            house,
                            index,
                            "reward",
                            event.target.value
                          )
                        }
                        placeholder="Belohnung"
                      />
                      <button
                        className="secondary"
                        onClick={() => removeReward(house, index)}
                      >
                        Entfernen
                      </button>
                    </div>
                  ))}
                </div>
                <div>
                  <button onClick={() => addReward(house)}>
                    Belohnung hinzufügen
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <footer>
        <p>
          Tipp: Ohne API-Key speichert die App die Screenshots lokal und lässt
          dich die Taskdaten manuell nachtragen. Für automatische Analyse den
          API-Key in der{" "}
          <Link href="/config">Konfiguration</Link> hinterlegen.
        </p>
      </footer>
    </main>
  );
}
