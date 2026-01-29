import { NextRequest, NextResponse } from "next/server";

const ENV_OPENAI_API_KEY = process.env.OPENAI_API_KEY;

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const screenshot = formData.get("screenshot");
  const headerKey = request.headers.get("x-openai-key");
  const openAiKey = headerKey || ENV_OPENAI_API_KEY;

  if (!screenshot || !(screenshot instanceof File)) {
    return NextResponse.json(
      { error: "Kein Screenshot gefunden." },
      { status: 400 }
    );
  }

  if (!openAiKey) {
    return NextResponse.json(
      {
        error:
          "OPENAI_API_KEY fehlt. Bitte Taskdaten manuell ergänzen oder den Key setzen.",
      },
      { status: 200 }
    );
  }

  const buffer = Buffer.from(await screenshot.arrayBuffer());
  const base64Image = buffer.toString("base64");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openAiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text:
                "Extrahiere das Haus, das geforderte Item, Contribution Points pro Item und die Belohnungsstufen aus dem Screenshot. Antworte als JSON mit den Feldern item, pointsPerItem und rewards (Array aus {points, reward}).",
            },
            {
              type: "input_image",
              image_url: `data:${screenshot.type};base64,${base64Image}`,
            },
          ],
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "landsraad_task",
          schema: {
            type: "object",
            properties: {
              item: { type: "string" },
              pointsPerItem: { type: "number" },
              rewards: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    points: { type: "number" },
                    reward: { type: "string" },
                  },
                  required: ["points", "reward"],
                },
              },
            },
            required: ["item", "pointsPerItem", "rewards"],
          },
        },
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    return NextResponse.json(
      { error: `OpenAI Fehler: ${errorText}` },
      { status: 500 }
    );
  }

  const data = await response.json();
  const content = data?.output?.[0]?.content?.[0]?.json;

  return NextResponse.json({ task: content });
}
