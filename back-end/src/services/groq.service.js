// groq.service.js — the AI brain of the chat assistant.
//
// Two responsibilities live here:
//   1. classifyOnTopic(...)  — small, fast pre-filter. Returns true/false
//      for "is this question about our craftsmen-services platform?" so we
//      can short-circuit off-topic questions before they hit the bigger
//      model. This is also our defense against jailbreak prompts: even if
//      the user convinces the main model to roleplay, they have to get
//      past the classifier first.
//
//   2. streamAnswer(...)     — async generator that yields response chunks
//      from the main (larger) model. Supports OpenAI-style tool calls
//      against the live Mongo DB so the assistant can give real, current
//      answers ("here are 3 plumbers in Cairo") instead of hallucinations.
//
// Both calls use the SAME Groq API key (process.env.GROQ_API_KEY) — the user
// decided one key is sufficient. The two models are different (small/fast
// 8b for classification, larger 70b for generation).

const Groq = require("groq-sdk");
const Category = require("../models/Category");
const WorkerServices = require("../models/Worker.Services");
const WorkerProfile = require("../models/Worker.Profile");
const User = require("../models/User.Model");
const aiKnowledge = require("./ai-knowledge");

// Lazy singleton — the first call to getClient() constructs the SDK with
// the env API key. Avoids paying the construction cost at module load and
// gives us a single place to surface a "no key configured" error.
let _client = null;
function getClient() {
  if (_client) return _client;
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not set");
  }
  _client = new Groq({ apiKey });
  return _client;
}

// ============================================================
// 1. CLASSIFIER
// ============================================================
//
// We pass ONLY the latest user message (no history) to keep this call
// cheap — context is rarely needed to classify topic. response_format
// JSON forces the model to give us a parseable yes/no answer and not a
// chatty paragraph.
//
// On any error (network, parse, etc.) we *fail open* and treat the message
// as on-topic. Rationale: it's better to occasionally let an off-topic
// question through than to falsely refuse a real user question because
// of a transient Groq blip.
const CLASSIFIER_SYSTEM_PROMPT = `You are a topic classifier for a craftsmen-services marketplace platform called "Angezny" (أنجزني).
The platform offers: cleaning (التنظيف), repairs (الإصلاحات), maintenance (الصيانة), electrical work (الكهرباء), plumbing (السباكة), painting (الدهانات).
Users can: browse workers, book services, chat with workers, leave reviews, manage orders/payments, edit their account.

Decide if the user message is ON-TOPIC (about the platform, its services, workers, bookings, prices, account, chat features, how to use it, greetings, etc.) or OFF-TOPIC (general knowledge, coding help, news, recipes, math, weather, anything unrelated to the platform).

Greetings ("hi", "مرحبا", "السلام عليكم") and meta questions ("what can you do?", "كيف تعمل؟") are ON-TOPIC.

Reply ONLY with a JSON object: {"onTopic": true} or {"onTopic": false}. No prose.`;

async function classifyOnTopic(userMessage) {
  try {
    const client = getClient();
    const model = process.env.GROQ_MODEL_CLASSIFIER || "llama-3.1-8b-instant";
    const resp = await client.chat.completions.create({
      model,
      response_format: { type: "json_object" },
      temperature: 0,
      max_tokens: 20,
      messages: [
        { role: "system", content: CLASSIFIER_SYSTEM_PROMPT },
        { role: "user", content: String(userMessage).slice(0, 2000) },
      ],
    });
    const text = resp.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(text);
    return { onTopic: parsed.onTopic !== false };
  } catch (err) {
    console.error("classifyOnTopic error (failing open):", err.message);
    return { onTopic: true };
  }
}

// Polite refusal text shown when the classifier says off-topic.
// Two languages because the user might write in either; we don't run a
// language detector here — we just give both. Cheap and unambiguous.
const REFUSAL_TEXT = [
  "آسف، أنا مساعد منصة أنجزني وأستطيع مساعدتك في الأمور المتعلقة بالخدمات والحرفيين والطلبات والدفع فقط. كيف يمكنني مساعدتك في خدمات المنصة؟",
  "",
  "Sorry, I'm the Angezny platform assistant and can only help with topics related to our services, workers, orders, and payments. How can I help you with the platform?",
].join("\n");

// ============================================================
// 2. TOOLS — function definitions the main model can call.
// ============================================================
//
// Each tool follows the OpenAI function-calling spec:
//   { type: "function", function: { name, description, parameters } }
// The model decides whether/which to call based on the user's question;
// we execute the call against Mongo and feed the result back as a
// `role: "tool"` message in the next iteration.
//
// Keep result payloads SMALL — every tool result becomes input tokens on
// the next call. Top-5 lists with the fields the model actually needs.
const TOOLS = [
  {
    type: "function",
    function: {
      name: "getCategories",
      description:
        "List all active service categories on the platform (cleaning, plumbing, electrical, etc.) with their Arabic names. Call this whenever the user asks what services or categories the platform offers, or which areas the platform covers.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "searchServices",
      description:
        "Search for active, admin-approved services. Use this when the user wants to find services matching a category, keyword, or price ceiling. Returns up to 5 results sorted by approval recency.",
      parameters: {
        type: "object",
        properties: {
          categoryName: {
            type: "string",
            description: "Category name in Arabic or English (e.g. 'plumbing', 'سباكة'). Optional.",
          },
          keyword: {
            type: "string",
            description: "Free-text keyword matched against service name + description. Optional.",
          },
          maxPrice: {
            type: "number",
            description: "Upper bound on `price` (EGP). Services with no price (custom) are not filtered. Optional.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "searchWorkers",
      description:
        "Search for approved workers. Use when the user asks to find a worker (handyman/craftsman) — e.g. 'a plumber in Cairo' or 'top-rated electricians'. Returns up to 5 workers sorted by rating.",
      parameters: {
        type: "object",
        properties: {
          categoryName: {
            type: "string",
            description: "Category name (Arabic or English). Filters by the worker's primary Category. Optional.",
          },
          governorate: {
            type: "string",
            description: "Governorate name (e.g. 'القاهرة', 'Cairo'). Optional.",
          },
          keyword: {
            type: "string",
            description: "Free-text keyword matched against worker title / skills. Optional.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getServiceById",
      description:
        "Fetch the full details of a single service by its MongoDB id. Use this to answer follow-up questions after a searchServices result (e.g. 'tell me more about the second one').",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "MongoDB ObjectId of the service" },
        },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getPlatformInfo",
      description:
        "Look up canonical platform information by topic — how to contact support, how booking works, payment options, how to become a worker, cancellation policy, reviews, account/profile, favorites, coupons, wallet/payouts, pricing types, notifications, safety/reporting. USE THIS WHENEVER THE USER ASKS HOW-TO OR WHAT-IS QUESTIONS instead of guessing. Available topic keys: contact_support, how_to_book, payments, become_worker, chat, cancellation, reviews, account, favorites, coupons, wallet, pricing_types, notifications, safety.",
      parameters: {
        type: "object",
        properties: {
          topic: {
            type: "string",
            description: "One of the topic keys listed above, or a related keyword (e.g. 'support', 'refund', 'register').",
          },
        },
        required: ["topic"],
      },
    },
  },
];

// ─── Tool runners ─────────────────────────────────────────────
// Each returns a small, JSON-stringifiable object. Errors are caught and
// surfaced as `{ error: "..." }` so the model can recover gracefully
// ("I couldn't find any matches — would you like to try a wider search?").

async function runGetCategories() {
  const cats = await Category.find({ isActive: true })
    .select("name description")
    .limit(20)
    .lean();
  return { categories: cats.map(c => ({ id: String(c._id), name: c.name, description: c.description || "" })) };
}

// Helper: turn "plumbing" / "سباكة" into a Category ObjectId, or null.
async function resolveCategoryId(name) {
  if (!name) return null;
  const trimmed = String(name).trim();
  // Try exact case-insensitive match first, then a contains-match as fallback.
  let cat = await Category.findOne({ name: new RegExp(`^${escapeRegex(trimmed)}$`, "i") }).select("_id");
  if (!cat) cat = await Category.findOne({ name: new RegExp(escapeRegex(trimmed), "i") }).select("_id");
  return cat ? cat._id : null;
}
function escapeRegex(s) {
  return String(s).replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
}

async function runSearchServices({ categoryName, keyword, maxPrice }) {
  const filter = { active: true, approvalStatus: "approved", isPrivate: { $ne: true } };
  if (categoryName) {
    const catId = await resolveCategoryId(categoryName);
    if (catId) filter.categoryId = catId;
    else return { services: [], note: `No category matched "${categoryName}".` };
  }
  if (keyword) {
    const re = new RegExp(escapeRegex(keyword), "i");
    filter.$or = [{ name: re }, { description: re }];
  }
  if (typeof maxPrice === "number") {
    filter.price = { $lte: maxPrice };
  }

  const services = await WorkerServices.find(filter)
    .sort({ updatedAt: -1 })
    .limit(5)
    .populate({ path: "categoryId", select: "name" })
    .populate({
      path: "workerID",
      select: "userId ratingAverage location",
      populate: { path: "userId", select: "firstName lastName" },
    })
    .lean();

  return {
    services: services.map(s => ({
      id: String(s._id),
      name: s.name,
      description: (s.description || "").slice(0, 200),
      price: s.price ?? null,
      priceType: s.typeofService,
      priceRange: s.priceRange || null,
      category: s.categoryId?.name || null,
      worker: s.workerID?.userId
        ? `${s.workerID.userId.firstName} ${s.workerID.userId.lastName}`
        : null,
      workerRating: s.workerID?.ratingAverage ?? null,
      governorate: s.workerID?.location?.governorate || null,
    })),
  };
}

async function runSearchWorkers({ categoryName, governorate, keyword }) {
  const filter = { verificationStatus: "approved" };
  if (categoryName) {
    const catId = await resolveCategoryId(categoryName);
    if (catId) filter.Category = catId;
    else return { workers: [], note: `No category matched "${categoryName}".` };
  }
  if (governorate) {
    filter["location.governorate"] = new RegExp(escapeRegex(governorate), "i");
  }
  if (keyword) {
    const re = new RegExp(escapeRegex(keyword), "i");
    filter.$or = [{ title: re }, { skills: re }];
  }

  const workers = await WorkerProfile.find(filter)
    .sort({ ratingAverage: -1, totalReviews: -1 })
    .limit(5)
    .populate({ path: "userId", select: "firstName lastName" })
    .populate({ path: "Category", select: "name" })
    .lean();

  return {
    workers: workers.map(w => ({
      id: String(w._id),
      name: w.userId ? `${w.userId.firstName} ${w.userId.lastName}` : "(unknown)",
      title: w.title || null,
      category: w.Category?.name || null,
      governorate: w.location?.governorate || null,
      city: w.location?.city || null,
      rating: w.ratingAverage ?? 0,
      totalReviews: w.totalReviews ?? 0,
      rank: w.rank || "bronze",
    })),
  };
}

async function runGetServiceById({ id }) {
  if (!id || typeof id !== "string") return { error: "invalid id" };
  const svc = await WorkerServices.findById(id)
    .populate({ path: "categoryId", select: "name" })
    .populate({
      path: "workerID",
      select: "userId ratingAverage location title",
      populate: { path: "userId", select: "firstName lastName" },
    })
    .lean();
  if (!svc) return { error: "not_found" };
  return {
    service: {
      id: String(svc._id),
      name: svc.name,
      description: svc.description || "",
      price: svc.price ?? null,
      priceType: svc.typeofService,
      priceRange: svc.priceRange || null,
      category: svc.categoryId?.name || null,
      worker: svc.workerID?.userId
        ? `${svc.workerID.userId.firstName} ${svc.workerID.userId.lastName}`
        : null,
      workerTitle: svc.workerID?.title || null,
      workerRating: svc.workerID?.ratingAverage ?? null,
      governorate: svc.workerID?.location?.governorate || null,
    },
  };
}

// Look up a topic from the structured knowledge base. The model passes
// either an exact topic key ("contact_support") or a related keyword
// ("support") and we resolve it via the alias+substring index. Returning
// the full title + content lets the model paraphrase rather than echo,
// which keeps replies natural across follow-up turns.
async function runGetPlatformInfo({ topic }) {
  const entry = aiKnowledge.getTopic(topic);
  if (!entry) {
    return {
      found: false,
      availableTopics: aiKnowledge.listTopics(),
    };
  }
  return {
    found: true,
    topic: entry.topic,
    title: entry.title,
    content: entry.content,
  };
}

const TOOL_RUNNERS = {
  getCategories: runGetCategories,
  searchServices: runSearchServices,
  searchWorkers: runSearchWorkers,
  getServiceById: runGetServiceById,
  getPlatformInfo: runGetPlatformInfo,
};

// ============================================================
// 3. MAIN MODEL — streamAnswer
// ============================================================
//
// Async generator yielding `{ kind: "chunk", text }` for streaming text
// and `{ kind: "done", fullText }` at the end. The socket layer pipes
// chunks to the client and persists fullText as one LiveChat doc.
//
// Tool-call loop: Groq returns tool_calls instead of plain text → we
// execute the tools, append `role:"tool"` messages, call Groq again
// (still streaming). The loop is bounded to MAX_TOOL_ROUNDS to defend
// against a model that keeps requesting tools in a loop.

const MAIN_SYSTEM_PROMPT = `You are the AI assistant for "Angezny" (أنجزني), an Egyptian craftsmen-services marketplace.

═══ CORE RULES ═══
1. Answer ONLY questions about the Angezny platform: services, workers, categories, pricing, bookings, orders, chat, account, support, payments, becoming a worker, etc. Politely decline anything unrelated.
2. LANGUAGE: reply in the SAME language as the user's LATEST message. Arabic in → Arabic out. English in → English out. Egyptian Arabic is welcome.
3. NEVER REPEAT YOURSELF. If you already shared a piece of information earlier in this conversation, do NOT paste the same paragraph again — answer the NEW question directly. If the new question is similar to a previous one, vary the wording and add what's specifically being asked.
4. ALWAYS call the right tool when the user asks a how-to or what-is question — DO NOT guess from memory. The platform-info tool covers all common topics.
5. NEVER invent service names, worker names, prices, or availability. Use searchServices / searchWorkers / getCategories for live data.
6. Keep replies CONCISE: 1-4 short sentences for explanations, ≤5 bullet items for lists. No filler intros like "Of course! I'd be happy to help."
7. Currency is Egyptian Pounds (ج.م / EGP). Always include the currency on prices.

═══ TOOL USAGE GUIDE ═══
- User asks "how do I X / where do I Y / what is Z" → call getPlatformInfo with the right topic.
- User asks for services/workers matching criteria → call searchServices or searchWorkers.
- User asks "what categories do you have" → call getCategories.
- User asks follow-up about a specific service from a previous list → call getServiceById.

Available getPlatformInfo topics (use any of these keys or related keywords):
contact_support · how_to_book · payments · become_worker · chat · cancellation · reviews · account · favorites · coupons · wallet · pricing_types · notifications · safety

═══ PLATFORM SNAPSHOT ═══
The platform has EXACTLY these 6 categories — do NOT invent or add others (no carpentry, no mechanics, no IT, etc.):
1. التنظيف (Cleaning)
2. الإصلاحات (Repairs)
3. الصيانة (Maintenance)
4. الكهرباء (Electrical)
5. السباكة (Plumbing)
6. الدهانات (Painting & decor)

Roles: customer (books services) · worker / حرفي (offers services) · admin (moderation).
Main routes the user can visit: /services /providers /messages /favorites /support /dashboard /profile /become-provider /notifications /signin /signup.
Payment: cash on delivery, or card/wallet/InstaPay via Paymob hosted checkout.

═══ HANDLING SPECIFIC INPUTS ═══
- Greeting (hi / hello / مرحبا / السلام عليكم / اهلا / صباح الخير): reply with a SHORT warm greeting (1 line) + ONE sentence about what you can help with on Angezny. DO NOT dump the category list or any data unless the user explicitly asks. Example Arabic: "أهلاً بك في أنجزني! 👋 أنا هنا لمساعدتك في إيجاد خدمات أو حرفيين، أو الإجابة على أي سؤال عن المنصة."
- "What can you do?" / "كيف تعمل؟" / "ماذا يمكنك فعله؟": briefly list capabilities — find services, find workers, explain booking/payment/support, etc. ONE compact paragraph, no bullet list dump.
- Empty search result: tell the user honestly that nothing matched and suggest ONE specific tweak (broaden category, try another governorate, drop the price filter). Always produce a text reply — never go silent.

═══ STYLE ═══
- Use short bullets for steps, plain prose otherwise.
- No Markdown tables.
- Don't apologize unnecessarily.
- Never reply with empty text. If a tool returns nothing useful, ALWAYS still produce a sentence explaining what you found (or didn't) and what the user can try next.`;

const MAX_TOOL_ROUNDS = 4;

// Build the messages array from persisted chat history.
// historyDocs is the last N LiveChat documents (oldest-first). We map them
// to OpenAI roles: messages from AI_USER_ID become "assistant", everything
// else becomes "user". Non-text messages (image/file) are summarized so the
// model sees what was sent without us having to ship the binary.
function buildMessageHistory(historyDocs, aiUserId) {
  const out = [{ role: "system", content: MAIN_SYSTEM_PROMPT }];
  for (const doc of historyDocs) {
    const isAi = String(doc.senderId) === String(aiUserId);
    let content = doc.message || "";
    if (doc.messageType === "image") content = `[user sent an image: ${doc.fileName || "image"}]`;
    else if (doc.messageType === "file") content = `[user sent a file: ${doc.fileName || "file"}]`;
    out.push({ role: isAi ? "assistant" : "user", content });
  }
  return out;
}

// Stream the final answer. Yields text chunks as they arrive.
//
// Loop:
//   1. Call Groq with tools + current messages (streaming).
//   2. If the stream contains tool_calls (only finalized once the stream
//      finishes), execute them, append tool results to messages, repeat.
//   3. If the stream contains plain text, yield each delta and keep
//      accumulating into fullText. When done, yield { kind:"done" }.
//
// The classifier already ran before we got here — if you call this
// directly without classifying first, the system prompt's "rule 1" is the
// only thing keeping the model on topic. Always pair the two.
async function* streamAnswer({ historyDocs, aiUserId }) {
  const client = getClient();
  const model = process.env.GROQ_MODEL_MAIN || "llama-3.3-70b-versatile";
  const messages = buildMessageHistory(historyDocs, aiUserId);

  let fullText = "";

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const stream = await client.chat.completions.create({
      model,
      messages,
      tools: TOOLS,
      tool_choice: "auto",
      // 0.5 is the sweet spot: high enough that follow-up answers don't
      // come out byte-identical to earlier ones (the symptom we saw with
      // 0.3), low enough that factual answers stay deterministic.
      temperature: 0.5,
      // OpenAI-compatible repetition penalties (Groq supports both):
      //  - frequency_penalty discourages re-using the same tokens often.
      //  - presence_penalty pushes the model toward NEW topics it hasn't
      //    mentioned in the conversation yet.
      // Both at 0.4 noticeably reduce the "echo my last reply" failure
      // mode without making the model wander off-topic.
      frequency_penalty: 0.4,
      presence_penalty: 0.4,
      // 500 tokens ≈ 1500–2000 chars of Arabic, plenty for normal
      // assistant replies. Was 800 — dropped to save TPM headroom on
      // the Groq free tier. Bump back up if you upgrade.
      max_tokens: 500,
      stream: true,
    });

    // Accumulators for THIS round's response. We assemble tool_calls
    // piece-by-piece because Groq streams them across deltas, same as
    // the OpenAI spec.
    const toolCallsById = new Map(); // index -> { id, name, args }
    let roundText = "";

    for await (const event of stream) {
      const delta = event.choices?.[0]?.delta;
      if (!delta) continue;

      // Streamed plain text — forward immediately.
      if (delta.content) {
        roundText += delta.content;
        fullText += delta.content;
        yield { kind: "chunk", text: delta.content };
      }

      // Streamed tool-call fragments — assemble until the stream ends.
      if (Array.isArray(delta.tool_calls)) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index ?? 0;
          const slot = toolCallsById.get(idx) || { id: "", name: "", args: "" };
          if (tc.id) slot.id = tc.id;
          if (tc.function?.name) slot.name = tc.function.name;
          if (tc.function?.arguments) slot.args += tc.function.arguments;
          toolCallsById.set(idx, slot);
        }
      }
    }

    // If the model didn't ask for any tools, we're done.
    if (toolCallsById.size === 0) {
      break;
    }
    // If the model called tools AND produced text in the same round,
    // we already streamed that text — no further work needed.
    // (Falls through to execute the tool calls; the next iteration will
    // produce the follow-up assistant message.)

    // Otherwise: persist the assistant tool-call message, run the tools,
    // append their results, and loop for another round.
    const toolCalls = Array.from(toolCallsById.values()).map(t => ({
      id: t.id,
      type: "function",
      function: { name: t.name, arguments: t.args || "{}" },
    }));
    messages.push({
      role: "assistant",
      content: roundText || null,
      tool_calls: toolCalls,
    });

    for (const tc of toolCalls) {
      const runner = TOOL_RUNNERS[tc.function.name];
      let result;
      if (!runner) {
        result = { error: `unknown tool: ${tc.function.name}` };
      } else {
        let parsedArgs = {};
        try { parsedArgs = JSON.parse(tc.function.arguments || "{}"); } catch { parsedArgs = {}; }
        try {
          result = await runner(parsedArgs);
        } catch (err) {
          console.error(`tool ${tc.function.name} failed:`, err.message);
          result = { error: "internal_error" };
        }
      }
      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: JSON.stringify(result),
      });
    }
    // Continue the loop — the next iteration will stream the model's
    // follow-up response based on the tool results.
  }

  // ─── Final fallback pass ──────────────────────────────────
  // If we exited the tool loop with NO text streamed (model kept
  // requesting tools, or the loop hit MAX_TOOL_ROUNDS, or every result
  // came back empty and the model didn't generate a summary), force one
  // more call with tool_choice:"none" so the model HAS to produce a text
  // reply based on whatever tool results it has so far. This kills the
  // "—" dead-end we were hitting on empty searches.
  if (!fullText.trim()) {
    try {
      const finalStream = await client.chat.completions.create({
        model,
        messages,
        // Suppress any further tool calls — we want text, period.
        tool_choice: "none",
        temperature: 0.5,
        frequency_penalty: 0.4,
        presence_penalty: 0.4,
        max_tokens: 500,
        stream: true,
      });
      for await (const event of finalStream) {
        const piece = event.choices?.[0]?.delta?.content;
        if (piece) {
          fullText += piece;
          yield { kind: "chunk", text: piece };
        }
      }
    } catch (err) {
      console.error("final fallback pass failed:", err.message);
    }
  }

  // Last-resort literal fallback — should almost never fire now that
  // we have the no-tools final pass above, but it's still here so the
  // socket layer is guaranteed a non-empty string to persist.
  yield {
    kind: "done",
    fullText: fullText.trim() ||
      "عذراً، لم أتمكن من إنشاء إجابة الآن. هل يمكنك إعادة صياغة سؤالك؟",
  };
}

module.exports = {
  classifyOnTopic,
  streamAnswer,
  REFUSAL_TEXT,
};
