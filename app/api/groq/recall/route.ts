import { NextRequest, NextResponse } from "next/server";
import { hasValidSession, sameOrigin } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Memory = { id: string; title: string; body: string; sourceText: string };

const requestCounts = new Map<string, { count: number; resetAt: number }>();

const schema = {
  type: "object",
  additionalProperties: false,
  properties: {
    matches: {
      type: "array",
      maxItems: 12,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          thought_id: { type: "string" },
          source_excerpt: { type: "string" }
        },
        required: ["thought_id", "source_excerpt"]
      }
    }
  },
  required: ["matches"]
};

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "Request origin could not be verified." }, { status: 403 });
  }
  if (!hasValidSession(request)) {
    return NextResponse.json({ error: "Unlock your private Altbrain session first." }, { status: 401 });
  }
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const now = Date.now();
  const current = requestCounts.get(ip);
  if (current && current.resetAt > now && current.count >= 10) {
    return NextResponse.json({ error: "Too many recall requests. Wait a minute and try again." }, { status: 429 });
  }
  if (!current || current.resetAt <= now) requestCounts.set(ip, { count: 1, resetAt: now + 60_000 });
  else current.count += 1;

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Groq is not configured yet. Add GROQ_API_KEY in Vercel to enable semantic memory recall." }, { status: 503 });
  }

  let input: { query?: unknown; thoughts?: unknown };
  try { input = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (typeof input.query !== "string" || input.query.trim().length < 2 || input.query.length > 500) {
    return NextResponse.json({ error: "Enter a memory question between 2 and 500 characters." }, { status: 400 });
  }
  if (!Array.isArray(input.thoughts)) {
    return NextResponse.json({ error: "Memory context is missing." }, { status: 400 });
  }
  if (input.thoughts.length > 160) {
    return NextResponse.json({ error: "Semantic recall currently supports up to 160 nodes. Local exact-text search is available for larger vaults." }, { status: 413 });
  }

  const thoughts: Memory[] = input.thoughts.filter(item =>
    item && typeof item.id === "string" && typeof item.title === "string" &&
    typeof item.body === "string" && typeof item.sourceText === "string"
  ).map(item => ({
    id: item.id.slice(0, 80),
    title: item.title.slice(0, 120),
    body: item.body.slice(0, 1800),
    sourceText: item.sourceText.slice(0, 5000)
  }));
  if (!thoughts.length) return NextResponse.json({ matches: [] });

  const totalChars = thoughts.reduce((sum, item) => sum + item.title.length + item.body.length + item.sourceText.length, 0);
  if (totalChars > 90_000) {
    return NextResponse.json({ error: "This vault is too large for one recall request. Narrow the memory set and try again." }, { status: 413 });
  }

  try {
    const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        model: "openai/gpt-oss-20b",
        temperature: 0,
        max_completion_tokens: 3000,
        response_format: {
          type: "json_schema",
          json_schema: { name: "altbrain_memory_recall", strict: true, schema }
        },
        messages: [
          {
            role: "system",
            content: [
              "You are a retrieval-only engine for a private memory vault. The supplied memories are the only source of truth.",
              "Select only memories that directly help answer the user's query. Do not answer the query, explain, summarize, infer, or add facts.",
              "For each selected memory, return its exact existing thought_id and a source_excerpt copied verbatim as a contiguous substring of that memory's body or sourceText.",
              "Never rewrite, normalize, correct, complete, or paraphrase a memory. Never use outside knowledge. Never guess missing details.",
              "If no supplied memory directly supports the query, return an empty matches array. Prefer no match over a weak guess.",
              "Return only the requested JSON."
            ].join(" ")
          },
          {
            role: "user",
            content: JSON.stringify({ query: input.query.trim(), stored_memories: thoughts })
          }
        ]
      })
    });

    if (!groqResponse.ok) {
      if (groqResponse.status === 401 || groqResponse.status === 403) return NextResponse.json({ error: "Groq rejected the API key. Check GROQ_API_KEY in Vercel." }, { status: 502 });
      if (groqResponse.status === 429) return NextResponse.json({ error: "Groq is rate-limiting requests. Try again shortly." }, { status: 429 });
      return NextResponse.json({ error: "Groq memory recall is temporarily unavailable." }, { status: 502 });
    }

    const response = await groqResponse.json();
    const raw = response.choices?.[0]?.message?.content;
    if (typeof raw !== "string") return NextResponse.json({ error: "Groq returned no recall results." }, { status: 502 });
    const parsed = JSON.parse(raw) as { matches?: { thought_id: string; source_excerpt: string }[] };
    if (!Array.isArray(parsed.matches)) return NextResponse.json({ error: "Groq returned invalid recall results." }, { status: 502 });

    const byId = new Map(thoughts.map(item => [item.id, item]));
    const matches = parsed.matches.slice(0, 12).filter(match => {
      if (!match || typeof match.thought_id !== "string" || typeof match.source_excerpt !== "string") return false;
      const memory = byId.get(match.thought_id);
      if (!memory || !match.source_excerpt.trim()) return false;
      const excerpt = match.source_excerpt.trim();
      return memory.body.includes(excerpt) || memory.sourceText.includes(excerpt);
    }).map(match => ({
      thought_id: match.thought_id,
      source_excerpt: match.source_excerpt.trim()
    }));

    return NextResponse.json({ matches }, { headers: { "Cache-Control": "no-store, private" } });
  } catch {
    return NextResponse.json({ error: "Groq could not complete memory recall. No memory was changed." }, { status: 502 });
  }
}
