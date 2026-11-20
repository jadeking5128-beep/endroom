import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ExistingThought = { id: string; title: string; body: string };
type StructuredNode = { title: string; content: string };
type Connection = {
  from_node_index: number;
  to_node_index: number;
  existing_thought_id: string;
  reason: string;
};

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

const schema = {
  type: "object",
  additionalProperties: false,
  properties: {
    nodes: {
      type: "array",
      minItems: 1,
      maxItems: 24,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          content: { type: "string" }
        },
        required: ["title", "content"]
      }
    },
    connections: {
      type: "array",
      maxItems: 80,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          from_node_index: { type: "integer" },
          to_node_index: { type: "integer" },
          existing_thought_id: { type: "string" },
          reason: { type: "string" }
        },
        required: ["from_node_index", "to_node_index", "existing_thought_id", "reason"]
      }
    }
  },
  required: ["nodes", "connections"]
};

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (!origin || !host) {
    return NextResponse.json({ error: "Request origin could not be verified." }, { status: 403 });
  }
  try {
    if (new URL(origin).host !== host) {
      return NextResponse.json({ error: "Cross-origin requests are not allowed." }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
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
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      cache: "no-store",
      body: JSON.stringify({
        model: "openai/gpt-oss-20b",
        temperature: 0.15,
        max_completion_tokens: 6000,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "altbrain_knowledge_graph",
            strict: true,
            schema
          }
        },
        messages: [
          {
            role: "system",
            content: [
              "You are Altbrain's knowledge-structuring engine.",
              "Turn the user's paragraph into a rich set of small, atomic, independently understandable knowledge points.",
              "Do not merely summarize the paragraph. Split distinct facts, claims, definitions, examples, questions, causes, effects, and ideas into separate nodes. Preserve important nuance and details. Usually create one node per distinct idea; use as many as the source supports, up to 24.",
              "Each node title should be concise. Its content should preserve the actual meaning from the source in clear wording.",
              "Do not add outside facts, assumptions, invented context, or conclusions. If the source is ambiguous, preserve that uncertainty.",
              "Create connections between new nodes when they share a concept, explain each other, are cause/effect, example/general rule, contrast, or prerequisite. Do not connect nodes merely because they are in the same paragraph.",
              "You may also connect a new node to an existing thought only when the supplied title/body directly supports a meaningful relationship. Use the exact existing thought ID. Never invent an ID.",
              "For a connection to another new node, set to_node_index to that node's zero-based index and existing_thought_id to an empty string. For a connection to an existing thought, set to_node_index to -1 and existing_thought_id to its exact ID.",
              "Each connection reason must briefly explain the actual relationship. Avoid duplicate or self-connections. It is acceptable to return no connections if none are justified.",
              "Return only the schema requested."
            ].join(" ")
          },
          {
            role: "user",
            content: JSON.stringify({
              paragraph: input.text.trim(),
              existing_thoughts_for_context: existing
            })
          }
        ]
      })
    });

    if (!groqResponse.ok) {
      const status = groqResponse.status;
      if (status === 401 || status === 403) {
        return NextResponse.json({ error: "Groq rejected the API key. Check GROQ_API_KEY in Vercel." }, { status: 502 });
      }
      if (status === 429) {
        return NextResponse.json({ error: "Groq is rate-limiting requests. Wait a little and try again." }, { status: 429 });
      }
      return NextResponse.json({ error: "Groq could not process this paragraph right now. Try again shortly." }, { status: 502 });
    }

    const response = await groqResponse.json();
    const raw = response.choices?.[0]?.message?.content;
    if (typeof raw !== "string") {
      return NextResponse.json({ error: "Groq returned an empty analysis." }, { status: 502 });
    }

    const parsed = JSON.parse(raw) as { nodes?: StructuredNode[]; connections?: Connection[] };
    if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.connections)) {
      return NextResponse.json({ error: "Groq returned an invalid knowledge graph." }, { status: 502 });
    }

    const nodes = parsed.nodes.slice(0, 24).filter(node =>
      node && typeof node.title === "string" && typeof node.content === "string" &&
      node.title.trim().length > 0 && node.content.trim().length > 0
    ).map(node => ({ title: node.title.trim().slice(0, 90), content: node.content.trim().slice(0, 4000) }));

    const connections = parsed.connections.slice(0, 80).filter(connection => {
      if (!connection || !Number.isInteger(connection.from_node_index) ||
          connection.from_node_index < 0 || connection.from_node_index >= nodes.length ||
          typeof connection.reason !== "string" || !connection.reason.trim()) return false;
      if (connection.to_node_index === -1) return existingIds.has(connection.existing_thought_id);
      return Number.isInteger(connection.to_node_index) &&
        connection.to_node_index >= 0 && connection.to_node_index < nodes.length &&
        connection.to_node_index !== connection.from_node_index &&
        connection.existing_thought_id === "";
    }).map(connection => ({
      from_node_index: connection.from_node_index,
      to_node_index: connection.to_node_index,
      existing_thought_id: connection.existing_thought_id,
      reason: connection.reason.trim().slice(0, 280)
    }));

    if (!nodes.length) {
      return NextResponse.json({ error: "No separate points could be extracted from that paragraph." }, { status: 422 });
    }

    return NextResponse.json({ nodes, connections }, {
      headers: { "Cache-Control": "no-store, private" }
    });
  } catch {
    return NextResponse.json({ error: "The Groq analysis failed. Check the API configuration and try again." }, { status: 502 });
  }
}
