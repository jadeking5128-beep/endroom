import { NextRequest, NextResponse } from "next/server";
import { hasValidSession, sameOrigin } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ExistingThought = { id: string; title: string; body: string };
type DetailPoint = { source_excerpt: string };
type Connection = {
  from_point_index: number;
  to_point_index: number;
  existing_thought_id: string;
  reason: string;
};
type ParentConnection = { existing_thought_id: string; reason: string };

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 8;
const requestCounts = new Map<string, { count: number; resetAt: number }>();

function rateLimited(ip: string) {
  const now = Date.now();
  const current = requestCounts.get(ip);
  if (!current || current.resetAt <= now) {
    requestCounts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  if (current.count >= MAX_REQUESTS_PER_WINDOW) return true;
  current.count += 1;
  return false;
}

const pointSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    source_excerpt: { type: "string" }
  },
  required: ["source_excerpt"]
};

const schema = {
  type: "object",
  additionalProperties: false,
  properties: {
    points: {
      type: "array",
      minItems: 1,
      maxItems: 80,
      items: pointSchema
    },
    parentConnections: {
      type: "array",
      maxItems: 20,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          existing_thought_id: { type: "string" },
          reason: { type: "string" }
        },
        required: ["existing_thought_id", "reason"]
      }
    },
    connections: {
      type: "array",
      maxItems: 120,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          from_point_index: { type: "integer" },
          to_point_index: { type: "integer" },
          existing_thought_id: { type: "string" },
          reason: { type: "string" }
        },
        required: ["from_point_index", "to_point_index", "existing_thought_id", "reason"]
      }
    }
  },
  required: ["points", "parentConnections", "connections"]
};

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "Request origin could not be verified." }, { status: 403 });
  }
  if (!hasValidSession(request)) {
    return NextResponse.json({ error: "Unlock your private Altbrain session first." }, { status: 401 });
  }

  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (rateLimited(forwardedFor)) {
    return NextResponse.json({ error: "Too many AI requests. Wait a minute and try again." }, { status: 429 });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Groq is not configured yet. Add GROQ_API_KEY to the Vercel project environment variables." }, { status: 503 });
  }

  let input: { text?: unknown; existingThoughts?: unknown };
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (typeof input.text !== "string" || input.text.trim().length < 12 || input.text.length > 14_000) {
    return NextResponse.json({ error: "Enter a paragraph between 12 and 14,000 characters." }, { status: 400 });
  }

  const existing = Array.isArray(input.existingThoughts)
    ? (input.existingThoughts as ExistingThought[]).slice(0, 80).filter(item =>
        item && typeof item.id === "string" && typeof item.title === "string" && typeof item.body === "string"
      ).map(item => ({ id: item.id.slice(0, 80), title: item.title.slice(0, 120), body: item.body.slice(0, 500) }))
    : [];
  const existingIds = new Set(existing.map(item => item.id));

  try {
    const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        model: "openai/gpt-oss-20b",
        temperature: 0.1,
        max_completion_tokens: 8000,
        response_format: {
          type: "json_schema",
          json_schema: { name: "altbrain_unified_memory", strict: true, schema }
        },
        messages: [
          {
            role: "system",
            content: [
              "You are Altbrain's source-grounded extraction engine. The app itself preserves the submitted paragraph as the one unified parent node. Your job is only to extract its details and suggest supported relationships.",
              "Do not create, summarize, title, or rewrite a parent node. The original paragraph is the parent node and must remain byte-for-byte unchanged in the app.",
              "Then extract every meaningful detail into smaller points: distinct facts, claims, definitions, names, dates, quantities, examples, explanations, conditions, questions, causes, effects, comparisons, exceptions, and qualifications. Do not omit details just to make the result shorter. Use as many points as needed, up to 80.",
              "Each point must contain only source_excerpt copied EXACTLY as a contiguous substring from the submitted paragraph. Never paraphrase, title, infer, or invent detail text. The app will label each point using its original words.",
              "Do not simply copy the whole paragraph into every point. Distribute its information carefully so that the points collectively preserve the full detail. The original paragraph remains the single unified parent node; the extracted points preserve its exact source fragments.",
              "Do not add outside facts, assumptions, invented context, or conclusions. Preserve ambiguity and uncertainty exactly where the source is unclear.",
              "Connect detail points to each other only when a real conceptual relationship exists, such as explanation, cause/effect, example/general rule, contrast, or dependency. Use exact existing memory IDs only when the supplied context supports a meaningful relationship.",
              "Parent connections are only links from the single unified parent node to existing memories. Detail-point connections use zero-based point indices or exact existing memory IDs. Do not invent IDs. Avoid duplicate and self-connections.",
              "For a detail-to-detail connection set to_point_index to the target point's zero-based index and existing_thought_id to an empty string. For a detail-to-existing-memory connection set to_point_index to -1 and existing_thought_id to its exact ID.",
              "Every connection reason must state the supported relationship briefly. Return only the requested JSON schema."
            ].join(" ")
          },
          {
            role: "user",
            content: JSON.stringify({ paragraph: input.text, existing_thoughts_for_context: existing })
          }
        ]
      })
    });

    if (!groqResponse.ok) {
      const status = groqResponse.status;
      if (status === 401 || status === 403) return NextResponse.json({ error: "Groq rejected the API key. Check GROQ_API_KEY in Vercel." }, { status: 502 });
      if (status === 429) return NextResponse.json({ error: "Groq is rate-limiting requests. Wait a little and try again." }, { status: 429 });
      return NextResponse.json({ error: "Groq could not process this paragraph right now. Try again shortly." }, { status: 502 });
    }

    const response = await groqResponse.json();
    const raw = response.choices?.[0]?.message?.content;
    if (typeof raw !== "string") return NextResponse.json({ error: "Groq returned an empty analysis." }, { status: 502 });

    const parsed = JSON.parse(raw) as {
      points?: DetailPoint[];
      parentConnections?: ParentConnection[];
      connections?: Connection[];
    };
    if (!Array.isArray(parsed.points) || !Array.isArray(parsed.parentConnections) || !Array.isArray(parsed.connections)) {
      return NextResponse.json({ error: "Groq returned an invalid unified memory structure." }, { status: 502 });
    }

    const sourceText = input.text;
    const points = parsed.points.slice(0, 80).filter(point =>
      point && typeof point.source_excerpt === "string" &&
      point.source_excerpt.trim().length > 0 && sourceText.includes(point.source_excerpt.trim())
    ).map(point => ({ source_excerpt: point.source_excerpt.trim().slice(0, 4000) }));

    if (!points.length) {
      return NextResponse.json({ error: "The paragraph did not produce any verifiable source excerpts. Nothing was saved." }, { status: 422 });
    }

    const parentConnections = parsed.parentConnections.slice(0, 20).filter(connection =>
      connection && typeof connection.existing_thought_id === "string" &&
      existingIds.has(connection.existing_thought_id) &&
      typeof connection.reason === "string" && connection.reason.trim().length > 0
    ).map(connection => ({
      existing_thought_id: connection.existing_thought_id,
      reason: connection.reason.trim().slice(0, 280)
    }));

    const connections = parsed.connections.slice(0, 120).filter(connection => {
      if (!connection || !Number.isInteger(connection.from_point_index) ||
          connection.from_point_index < 0 || connection.from_point_index >= points.length ||
          typeof connection.reason !== "string" || !connection.reason.trim()) return false;
      if (connection.to_point_index === -1) return existingIds.has(connection.existing_thought_id);
      return Number.isInteger(connection.to_point_index) &&
        connection.to_point_index >= 0 && connection.to_point_index < points.length &&
        connection.to_point_index !== connection.from_point_index &&
        connection.existing_thought_id === "";
    }).map(connection => ({
      from_point_index: connection.from_point_index,
      to_point_index: connection.to_point_index,
      existing_thought_id: connection.existing_thought_id,
      reason: connection.reason.trim().slice(0, 280)
    }));

    return NextResponse.json({ points, parentConnections, connections }, {
      headers: { "Cache-Control": "no-store, private" }
    });
  } catch {
    return NextResponse.json({ error: "The Groq analysis failed. Check the API configuration and try again." }, { status: 502 });
  }
}
