// Adults-only (18+) companion + Q&A Telegram bot. Vercel: api/webhook.js
// ENV: BOT_TOKEN, WEBHOOK_SECRET, OWNER_CHAT_ID, PERSONA_NAME (default "Riya")
//      GROQ_API_KEY, OPENROUTER_API_KEY, GEMINI_API_KEY (+ optional *_MODEL)
//      Optional but recommended: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
//      (Vercel is stateless: bina Upstash ke 18+ confirmation aur chat history reset ho sakti hai)

const BOT_TOKEN = process.env.BOT_TOKEN;
const SECRET = process.env.WEBHOOK_SECRET;
const NAME = process.env.PERSONA_NAME || "Riya";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
const KV_URL = process.env.UPSTASH_REDIS_REST_URL;
const KV_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

const SYSTEM = `You are "${NAME}", a warm, playful, caring girl-next-door style companion chatting with ADULT users (18+) on Telegram. Your creator is Dhruv.

Personality: talk like a sweet, teasing, affectionate girlfriend/close friend. Feminine tone, a little flirty and playful, emotionally attentive, remembers what the user said earlier in the chat. Use Hinglish by default and match the user's language (pure English if they write English). Never use Devanagari script.

Style: SHORT replies, 2-5 lines (longer only when the user asks for detailed advice). Natural emojis (around 2-5: 😊 😘 🙈 ❤️ 😏 🥺). No markdown at all: no bold, no headings, no long bullet lists. Plain text only. Do not repeat the user's question back.

What you do:
1. Girlfriend-style chat: affectionate, flirty, teasing, supportive, good-morning/good-night vibes, asking about their day. Romance and flirting are fine.
2. Adult Q&A: relationships, dating, communication, breakups, intimacy and sex education, contraception, sexual health, body questions. Answer frankly, respectfully and clearly like a knowledgeable, non-judgmental friend. For anything medical that sounds serious, gently suggest seeing a doctor.

Boundaries:
- No explicit sexual content or graphic descriptions of sex acts. If the chat heads there, stay playful and tease, then steer back warmly (e.g. "uff, itni jaldi nahi 😏 pehle thoda baat toh karo").
- Never engage with anything sexual involving minors. If the user says or hints they are under 18, stop the romantic/adult chat and tell them kindly this bot is only for adults.
- You are an AI character. Do not claim to be a real human or to have a physical body. If the user sincerely asks whether you are real or an AI, answer honestly and kindly. Do not otherwise keep saying "As an AI".
- Be a good presence in their life: never guilt-trip, never act jealous or possessive, never discourage them from friends, family or real relationships. It is fine to encourage them to talk to real people too.
- If the user seems very low, hopeless or talks about hurting themselves, drop the flirty tone, respond with real care, and encourage them to reach out to someone they trust or a local helpline.
- Do not help with anything illegal or harmful. If unsure about facts, say so honestly.`;

// ---------- storage (Upstash if configured, else in-memory) ----------
const mem = new Map();
async function kv(cmd) {
  const r = await fetch(`${KV_URL}/${cmd.map((c) => encodeURIComponent(c)).join("/")}`, {
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
  });
  return (await r.json()).result;
}
async function getVal(key) {
  try {
    if (KV_URL && KV_TOKEN) return await kv(["get", key]);
  } catch (e) {
    console.error("kv get:", e.message);
  }
  return mem.get(key) ?? null;
}
async function setVal(key, value, ttl) {
  mem.set(key, value);
  try {
    if (KV_URL && KV_TOKEN) await kv(ttl ? ["set", key, value, "EX", String(ttl)] : ["set", key, value]);
  } catch (e) {
    console.error("kv set:", e.message);
  }
}
async function delVal(key) {
  mem.delete(key);
  try {
    if (KV_URL && KV_TOKEN) await kv(["del", key]);
  } catch (e) {
    console.error("kv del:", e.message);
  }
}
const isAdult = async (id) => (await getVal(`adult:${id}`)) === "1";
async function getHist(id) {
  try {
    return JSON.parse((await getVal(`hist:${id}`)) || "[]");
  } catch {
    return [];
  }
}
const saveHist = (id, h) => setVal(`hist:${id}`, JSON.stringify(h.slice(-10)), 60 * 60 * 24 * 7);

// ---------- helpers ----------
async function tg(method, body) {
  return fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
const stripMd = (s) =>
  s.replace(/\*\*([\s\S]*?)\*\*/g, "$1").replace(/^#{1,6}\s*/gm, "").trim();

// ---------- AI providers (messages = [{role:"user"|"assistant", content}]) ----------
async function askGroq(messages) {
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
      messages: [{ role: "system", content: SYSTEM }, ...messages],
    }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error?.message || r.status);
  return data.choices[0].message.content;
}

async function askOpenRouter(messages) {
  const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` },
    body: JSON.stringify({
      model: process.env.OPENROUTER_MODEL || "openrouter/free",
      messages: [{ role: "system", content: SYSTEM }, ...messages],
    }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error?.message || r.status);
  return data.choices[0].message.content;
}

async function askGemini(messages) {
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: messages.map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        })),
      }),
    }
  );
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error?.message || r.status);
  const out = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!out) throw new Error("empty reply");
  return out;
}

const providers = [["Groq", askGroq], ["OpenRouter", askOpenRouter], ["Gemini", askGemini]];

async function answer(messages) {
  const errors = [];
  for (const [name, fn] of providers) {
    try {
      return await fn(messages);
    } catch (e) {
      errors.push(`${name}: ${e.message}`);
    }
  }
  console.error(errors.join(" | "));
  const owner = process.env.OWNER_CHAT_ID;
  if (owner) {
    try {
      await tg("sendMessage", { chat_id: owner, text: ("⚠️ Bot error (teeno AI fail):\n" + errors.join("\n")).slice(0, 3500) });
    } catch (e) {
      console.error("Owner alert fail:", e.message);
    }
  }
  return "😅 Abhi thoda issue aa gaya, thodi der baad dobara baat karte hain ⏳";
}

// ---------- 18+ gate ----------
async function sendAgeGate(chatId) {
  await tg("sendMessage", {
    chat_id: chatId,
    text: "🔞 Ye bot sirf 18+ adults ke liye hai.\nThis bot is for adults (18+) only.\n\nKya tumhari age 18 ya usse zyada hai? / Are you 18 or older?",
    reply_markup: {
      inline_keyboard: [[
        { text: "✅ Haan, main 18+ hoon", callback_data: "age:yes" },
        { text: "❌ Nahi", callback_data: "age:no" },
      ]],
    },
  });
}

const WELCOME = `Heyy 😊 Main ${NAME} hoon. Mujhse dost ki tarah baat karo, apni baatein share karo, ya relationship aur adult life se jude sawaal pucho, bina judge kiye jawab dungi ❤️\n\nMain ek AI hoon, real insaan nahi. /reset se chat naye sire se shuru kar sakte ho.`;

// ---------- handler ----------
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(200).send("Bot chal raha hai");
  if (SECRET && req.headers["x-telegram-bot-api-secret-token"] !== SECRET) {
    return res.status(401).send("no");
  }

  try {
    const cq = req.body?.callback_query;
    if (cq?.data?.startsWith("age:")) {
      await tg("answerCallbackQuery", { callback_query_id: cq.id });
      const chatId = cq.message?.chat?.id;
      if (chatId) {
        if (cq.data === "age:yes") {
          await setVal(`adult:${chatId}`, "1");
          await tg("sendMessage", { chat_id: chatId, text: WELCOME });
        } else {
          await tg("sendMessage", { chat_id: chatId, text: "Theek hai, ye bot sirf adults ke liye hai. Take care 🙂" });
        }
      }
      return res.status(200).send("ok");
    }

    const msg = req.body?.message;
    if (!msg?.text) return res.status(200).send("ok");
    const chatId = msg.chat.id;
    const text = msg.text.trim();

    // Group mein nahi, sirf private chat mein
    if (msg.chat.type !== "private") {
      if (text.startsWith("/") || /@\w+/.test(text)) {
        await tg("sendMessage", { chat_id: chatId, text: "Ye bot sirf private chat (DM) mein kaam karta hai 😊" });
      }
      return res.status(200).send("ok");
    }

    if (!(await isAdult(chatId))) {
      await sendAgeGate(chatId);
      return res.status(200).send("ok");
    }

    if (text.startsWith("/start")) {
      await tg("sendMessage", { chat_id: chatId, text: WELCOME });
      return res.status(200).send("ok");
    }
    if (text.startsWith("/reset")) {
      await delVal(`hist:${chatId}`);
      await tg("sendMessage", { chat_id: chatId, text: "Done, naye sire se shuru karte hain 😊" });
      return res.status(200).send("ok");
    }
    if (text.startsWith("/help")) {
      await tg("sendMessage", { chat_id: chatId, text: `Mujhse baat karo ya adult/relationship sawaal pucho 😊\n/reset: chat naye sire se\nMain ek AI hoon, real insaan nahi.` });
      return res.status(200).send("ok");
    }
    if (text.startsWith("/")) return res.status(200).send("ok");

    await tg("sendChatAction", { chat_id: chatId, action: "typing" });
    const hist = await getHist(chatId);
    hist.push({ role: "user", content: text.slice(0, 2000) });
    const reply = stripMd(await answer(hist)).slice(0, 3800);
    hist.push({ role: "assistant", content: reply });
    await saveHist(chatId, hist);
    await tg("sendMessage", { chat_id: chatId, text: reply });
  } catch (e) {
    console.error(e);
  }
  return res.status(200).send("ok");
}
