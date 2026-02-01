import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";

let PROMPT: string | null = null;

function loadPrompt(): string {
  if (PROMPT) return PROMPT;
  
  try {
    const promptPath = join(process.cwd(), "prompt.md");
    const content = readFileSync(promptPath, "utf-8");
    PROMPT = content
      .replace(/```[^`]*```/gs, "")
      .replace(/^#{1,6} .*$/gm, "")
      .replace(/^---$/gm, "")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1")
      .replace(/__([^_]+)__/g, "$1")
      .replace(/_([^_]+)_/g, "$1")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .join("\n")
      .trim();
    return PROMPT;
  } catch (error) {
    console.error("Fehler beim Laden von prompt.md:", error);
    throw new Error("prompt.md nicht gefunden oder nicht lesbar");
  }
}

function extractJsonFromText(text: string): any | null {
  const arrayStart = text.indexOf("[");
  const arrayEnd = text.lastIndexOf("]");
  if (arrayStart !== -1 && arrayEnd !== -1 && arrayEnd >= arrayStart) {
    try {
      return JSON.parse(text.substring(arrayStart, arrayEnd + 1));
    } catch (e) {
      // fallback
    }
  }

  const objectStart = text.indexOf("{");
  const objectEnd = text.lastIndexOf("}");
  if (objectStart !== -1 && objectEnd !== -1 && objectEnd >= objectStart) {
    try {
      const parsed = JSON.parse(text.substring(objectStart, objectEnd + 1));
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch (e) {
      return null;
    }
  }
  return null;
}

function normalizeResult(raw: any): Array<{
  house: string | null;
  task: {
    type: "revealed" | "unrevealed";
    kind: "deliver" | "kill" | null;
    request: string | null;
    contribution: number;
    rewards: Record<string, string>;
  };
}> {
  const safeArray = Array.isArray(raw) ? raw : [raw].filter(Boolean);

  return safeArray.map((entry) => {
    const house =
      typeof entry?.house === "string" ? entry.house.trim() : null;

    const normalizedHouse = house && house.length > 0 ? house : null;

    const rawTask = entry?.task ?? {};
    const rawType = rawTask?.type;
    const hasRevealedSignals =
      typeof rawTask?.request === "string" ||
      (rawTask?.rewards && typeof rawTask.rewards === "object") ||
      Number.isFinite(rawTask?.contribution);

    const kind =
      rawTask?.kind === "deliver" || rawTask?.kind === "kill"
        ? rawTask.kind
        : rawType === "deliver" || rawType === "kill"
        ? rawType
        : null;

    const type: "revealed" | "unrevealed" =
      rawType === "revealed" || rawType === "unrevealed"
        ? rawType
        : kind
        ? "revealed"
        : hasRevealedSignals
        ? "revealed"
        : "unrevealed";

    const request =
      type === "revealed" && typeof rawTask?.request === "string"
        ? rawTask.request
        : null;

    const contribution = Number.isFinite(rawTask?.contribution)
      ? Number(rawTask.contribution)
      : 0;

    const rewards: Record<string, string> = {};
    if (type === "revealed" && rawTask?.rewards && typeof rawTask.rewards === "object") {
      for (const [key, value] of Object.entries(rawTask.rewards)) {
        if (typeof value === "string") {
          rewards[String(key)] = value;
        }
      }
    }

    return {
      house: normalizedHouse,
      task: {
        type,
        kind,
        request,
        contribution,
        rewards,
      },
    };
  });
}

function scoreTask(task: {
  type: "revealed" | "unrevealed";
  kind: "deliver" | "kill" | null;
  request: string | null;
  contribution: number;
  rewards: Record<string, string>;
}): number {
  let score = 0;
  if (task.type === "revealed") score += 5;
  if (task.kind) score += 2;
  if (task.request) score += 2;
  if (Number.isFinite(task.contribution) && task.contribution > 0) score += 1;
  if (task.rewards && Object.keys(task.rewards).length > 0) score += 2;
  return score;
}

function dedupeResults(
  items: Array<{
    house: string | null;
    task: {
      type: "revealed" | "unrevealed";
      kind: "deliver" | "kill" | null;
      request: string | null;
      contribution: number;
      rewards: Record<string, string>;
    };
  }>
) {
  const byHouse = new Map<string, typeof items[number]>();
  const noHouse: typeof items = [];

  for (const item of items) {
    if (!item.house) {
      noHouse.push(item);
      continue;
    }
    const key = item.house;
    const existing = byHouse.get(key);
    if (!existing) {
      byHouse.set(key, item);
      continue;
    }
    if (scoreTask(item.task) > scoreTask(existing.task)) {
      byHouse.set(key, item);
    }
  }

  return [...byHouse.values(), ...noHouse];
}

export async function POST(request: NextRequest) {
  try {
    const { imageDataUrls, apiKey } = await request.json();

    // Akzeptiere sowohl einzelne URL als auch Array
    let images: string[] = [];
    if (typeof imageDataUrls === "string") {
      images = [imageDataUrls];
    } else if (Array.isArray(imageDataUrls)) {
      images = imageDataUrls;
    }

    if (!images || images.length === 0) {
      return NextResponse.json(
        { error: "imageDataUrls (string oder array) erforderlich" },
        { status: 400 }
      );
    }

    const token =
      apiKey ||
      process.env.HF_TOKEN ||
      process.env.HUGGINGFACE_API_KEY;
    if (!token) {
      return NextResponse.json(
        {
          error:
            "Hugging Face API-Token fehlt. Setze HF_TOKEN/HUGGINGFACE_API_KEY oder sende apiKey im Request.",
        },
        { status: 400 }
      );
    }

    const prompt = loadPrompt();
    return await analyzeWithHfVlm(images, token, prompt);
  } catch (error) {
    console.error("Fehler in POST:", error);
    return NextResponse.json(
      { error: `Server-Fehler: ${String(error)}` },
      { status: 500 }
    );
  }
}

async function analyzeWithHfVlm(
  imageDataUrls: string[],
  token: string,
  prompt: string
) {
  const VLM_MODELS = (process.env.HF_VLM_MODELS ||
    "llava-hf/llava-1.5-7b-hf,Qwen/Qwen3-VL-8B-Instruct")
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean);

  type HfVlmError = { status?: number; text?: string };
  let lastError: HfVlmError | null = null;

  const chunkSize = 5;
  const chunks: string[][] = [];
  for (let i = 0; i < imageDataUrls.length; i += chunkSize) {
    chunks.push(imageDataUrls.slice(i, i + chunkSize));
  }

  for (const model of VLM_MODELS) {
    try {
      console.log(
        `Versuche VLM-Modell: ${model} mit ${imageDataUrls.length} Bild(ern) in ${chunks.length} Anfrage(n)`
      );

      const analyzeBatch = async (batch: string[], batchIndex: number) => {
        // Konstruiere Message mit Text und Bildern
        const messageContent: any[] = [
          {
            type: "text",
            text: prompt,
          },
        ];

        for (const dataUrl of batch) {
          if (!dataUrl.startsWith("data:")) {
            throw new Error("Ungültiges DataURL Format");
          }
          messageContent.push({
            type: "image_url",
            image_url: {
              url: dataUrl,
            },
          });
        }

        if (messageContent.length === 1) {
          throw new Error("Keine gültigen Bilder gefunden");
        }

        const redactedMessageContent = messageContent.map((item) => {
          if (item.type !== "image_url") return item;
          const url = item.image_url?.url ?? "";
          return {
            ...item,
            image_url: {
              ...item.image_url,
              url: `${url.slice(0, 40)}...[${url.length} chars]`,
            },
          };
        });

        console.log(
          `POST https://router.huggingface.co/v1/chat/completions (batch ${batchIndex + 1}/${chunks.length})`,
          JSON.stringify({
            model: model,
            messages: [
              {
                role: "user",
                content: redactedMessageContent,
              },
            ],
            max_tokens: 4000,
            temperature: 0.1,
          })
        );

        const url = "https://router.huggingface.co/v1/chat/completions";
        const payload = JSON.stringify({
          model: model,
          messages: [
            {
              role: "user",
              content: messageContent,
            },
          ],
          max_tokens: 4000,
          temperature: 0.1,
        });

        let response: Response | null = null;
        let lastTxt = "";
        for (let attempt = 1; attempt <= 3; attempt++) {
          response = await fetch(url, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: payload,
          });

          if (response.ok) break;
          lastTxt = await response.text().catch(() => "<no body>");

          const retryable =
            response.status === 429 ||
            response.status >= 500 ||
            lastTxt.toLowerCase().includes("cloudfront");

          if (!retryable || attempt === 3) break;

          const waitMs = 500 * Math.pow(2, attempt - 1);
          await new Promise((resolve) => setTimeout(resolve, waitMs));
        }

        if (!response || !response.ok) {
          const txt = lastTxt || (await response?.text().catch(() => "<no body>"));
          const isCloudFront = txt?.toLowerCase().includes("cloudfront");
          console.error(
            `Model ${model} batch ${batchIndex + 1} failed:`,
            response?.status,
            txt
          );
          throw Object.assign(new Error("Model batch failed"), {
            status: response?.status,
            text: isCloudFront
              ? "403 CloudFront request blocked (rate limit / config / access)"
              : txt,
          });
        }

        const result = await response.json();
        const content = result.choices?.[0]?.message?.content;
        if (!content) {
          throw new Error("No content in response");
        }

        const parsed = extractJsonFromText(content);
        if (!parsed || !Array.isArray(parsed)) {
          throw new Error("No valid JSON array in response");
        }

        return normalizeResult(parsed);
      };

      const batchResults = await Promise.allSettled(
        chunks.map((batch, index) => analyzeBatch(batch, index))
      );

      const merged = batchResults
        .filter(
          (
            res
          ): res is PromiseFulfilledResult<
            Array<{
              house: string | null;
              task: {
                type: "revealed" | "unrevealed";
                kind: "deliver" | "kill" | null;
                request: string | null;
                contribution: number;
                rewards: Record<string, string>;
              };
            }>
          > => res.status === "fulfilled"
        )
        .flatMap((res) => res.value);

      const failed = batchResults
        .filter(
          (res): res is PromiseRejectedResult => res.status === "rejected"
        )
        .map((res) => {
          const status = res.reason?.status;
          const text = res.reason?.text;
          const message = res.reason?.message;
          if (status && text) return `${status}: ${text}`;
          if (status && message) return `${status}: ${message}`;
          return String(message ?? res.reason ?? "unknown");
        });

      if (merged.length === 0) {
        let priorStatus: number | undefined;
        if (lastError && typeof lastError.status === "number") {
          priorStatus = lastError.status;
        }
        lastError = {
          status: priorStatus ?? 502,
          text: `All batches failed: ${failed.join(" | ")}`,
        };
        continue;
      }

      const deduped = dedupeResults(merged);
      console.log(`Model ${model} erfolgreich`);
      return NextResponse.json({
        success: true,
        model,
        result: deduped,
        warnings: failed.length > 0 ? { failedBatches: failed } : undefined,
      });
    } catch (err: any) {
      console.error(`VLM model ${model} error:`, err?.message ?? String(err));
      lastError = {
        status: err?.status,
        text: err?.text || err?.message || String(err),
      };
      continue;
    }
  }

  return NextResponse.json(
    {
      success: false,
      error: "Keine VLM-Modelle verfügbar",
      details: lastError,
      suggestion:
        "Prüfe HF_TOKEN/HUGGINGFACE_API_KEY und setze HF_VLM_MODELS auf verfügbare Vision-Language-Modelle",
    },
    { status: 502 }
  );
}
