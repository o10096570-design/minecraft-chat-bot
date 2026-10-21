const BOT_TOKEN = process.env.BOT_TOKEN;
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const SECRET = process.env.WEBHOOK_SECRET;
const MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
const CHANNEL = "@minecraftrapidnews";

const SYSTEM = `You are the Minecraft Rapid chat bot. Your owner and creator is Dhruv.
Answer Minecraft questions (Java and Bedrock, mobile and PC): crafting, redstone, mods, seeds, tips, commands.
Reply in the same language the user writes in (Hinglish if they use Hinglish). Keep answers short and clear.`;

async function tg(method, body) {
  return fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function askGemini(text) {
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_KEY },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: "user", parts: [{ text }] }],
      }),
    }
  );
  const data = await r.json();
  if (!r.ok) return "Gemini error: " + (data?.error?.message || r.status);
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || "Abhi jawab nahi de paya, thodi der baad try karo.";
}
async function askGroq(text) {
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: text },
      ],
    }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error?.message || r.status);
  return data.choices[0].message.content;
}

async function askAI(text) {
  try {
    return await askGroq(text);
  } catch (e) {
    console.error("Groq fail:", e.message);
    return await askGemini(text);
  }
}
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(200).send("Bot chal raha hai");
    if (SECRET && req.headers["x-telegram-bot-api-secret-token"] !== SECRET) {
    return res.status(401).send("no");
  }

  try {
    const msg = req.body?.message;
    if (msg?.text) {
      const chatId = msg.chat.id;
      const isPrivate = msg.chat.type === "private";
      let text = msg.text.trim();

      if (text.startsWith("/start")) {
        await tg("sendMessage", {
          chat_id: chatId,
          text: `Hi! Main Minecraft Rapid bot hu, mere owner Dhruv hain. Minecraft ka koi bhi sawaal pucho.\nDaily news: ${CHANNEL}`,
        });
      } else {
        if (!isPrivate) {
          if (!text.startsWith("/ask")) return res.status(200).send("ok");
          text = text.replace(/^\/ask(@\w+)?/, "").trim();
        }
        if (text) {
          await tg("sendChatAction", { chat_id: chatId, action: "typing" });
          let reply = (await askAI(text)).slice(0, 3800);
          if (Math.random() < 0.3) reply += `\n\nDaily Minecraft news: ${CHANNEL}`;
          await tg("sendMessage", { chat_id: chatId, text: reply });
        }
      }
    }
  } catch (e) {
    console.error(e);
  }
  return res.status(200).send("ok");
}
