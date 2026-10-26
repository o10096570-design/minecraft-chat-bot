const BOT_TOKEN = process.env.BOT_TOKEN;
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const SECRET = process.env.WEBHOOK_SECRET;
const MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
const CHANNEL = "@minecraftrapidnews";
// Group mein bot tabhi bolega jab: /ask likha ho, @bot tag ho,
// neeche ke naamo mein se koi likha ho, ya bot ke message pe reply kiya ho.
// Apne hisaab se naam badal ya add kar sakte ho (chhote letters mein likho).
const BOT_NAMES = ["minerapid", "mine rapid", "minecraft rapid", "rapid bot"];
const STICKERS = [
  "CAACAgIAAxkBAANuatiYdR4vPqa45BPEvKqZL3CNr3EAAlQpAAJb8qFIcnjAbs6G8AQ9BA",
  "CAACAgIAAxkBAANsatiYbgWstP4LthlGhkRr3qjAYDUAAigpAAL5a6BI6rtwSE431s09BA",
  "CAACAgUAAxkBAANoatiYQhIw0K5shoPlhO_Ha36SftwAAr8VAAI8LRFV5WZcNMODbuM9BA",
  "CAACAgUAAxkBAANqatiYX4usx1eIpSqSZDeTyP_h3isAAvkcAAKqoAhVH2OsvoRSiWw9BA",
  "CAACAgUAAxkBAANmatiYNvVVn-1AWylmTy49q9L-Cy4AAkYOAAJYLvFW5VXT8SSDGrA9BA",
];

const SYSTEM = `You are "MineRapid", a fun Minecraft buddy chatting with players on Telegram. Your owner and creator is Dhruv.
Personality: talk like a friendly, hyped-up friend (dost), not like a robot or a teacher. Casual, warm, a little playful. Use Hinglish by default and match the user's language (pure English if they write English).
Style rules:
- Keep replies SHORT: 2-5 short lines, under about 400 characters, unless the user clearly asks for a detailed guide.
- Use emojis naturally, around 3-6 per reply (for example ⛏️ 🔥 😎 🎮 💎 😂 👍), but do not spam them.
- No markdown at all: no **bold**, no # headings, no long bullet lists. Plain text only. If steps are needed, use short numbered lines (1. 2. 3.).
- Give the main answer first, then at most one fun tip, and optionally end with a quick friendly question to keep the chat going.
- You know Minecraft well (Java and Bedrock, mobile and PC): crafting, redstone, mods, seeds, tips, commands. If you are not sure about something, say so honestly instead of guessing.
- Never say "As an AI". Do not repeat the user's question back.`;

// Telegram plain text mein ** aur # ganda dikhte hain, unhe hata deta hai
function stripMd(s) {
  return s
    .replace(/\*\*([\s\S]*?)\*\*/g, "$1")
    .replace(/^#{1,6}\s*/gm, "")
    .trim();
}

async function tg(method, body) {
  return fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

let BOT_USERNAME = null;
async function getBotUsername() {
  if (BOT_USERNAME) return BOT_USERNAME;
  try {
    const r = await tg("getMe", {});
    const j = await r.json();
    BOT_USERNAME = j?.result?.username || null;
  } catch (e) {
    console.error("getMe fail:", e.message);
  }
  return BOT_USERNAME;
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
  if (!r.ok) throw new Error(data?.error?.message || r.status);
  const out = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!out) throw new Error("empty reply");
  return out;
}

async function askGroq(text) {
  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
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

async function askOpenRouter(text) {
  const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
    },
    body: JSON.stringify({
      model: process.env.OPENROUTER_MODEL || "openrouter/free",
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

function quickReply(text) {
  const t = text.toLowerCase().trim();
  if (t.includes("channel") && (t.includes("link") || t.includes("join"))) {
    return `📢 Daily Minecraft news aur tips yahan milte hain: ${CHANNEL}`;
  }
  const ownerQ = ["tumhara owner", "tera owner", "kisne banaya", "who made you", "who created you", "your owner"];
  if (ownerQ.some((q) => t.includes(q))) {
    return "👤 Mujhe Dhruv ne banaya hai, wahi mere owner hain.";
  }
  if (["hi", "hii", "hello", "hey"].includes(t)) {
    return "👋 Hi! Minecraft ka koi bhi sawaal pucho ⛏️";
  }
  if (t.startsWith("/help")) {
    return `ℹ️ Mujhse Minecraft ka koi bhi sawaal pucho (crafting, redstone, seeds, tips).\n🎮 Shader chahiye toh likho: shader do.\n👥 Group mein /ask likh ke pucho.\n📢 News: ${CHANNEL}`;
  }
  return null;
}

const providers = [
  ["Groq", askGroq],
  ["OpenRouter", askOpenRouter],
  ["Gemini", askGemini],
];

async function answer(text, context = "") {
  const quick = quickReply(text);
  if (quick) return quick;

  // Agar user bot ke kisi message pe reply kar raha hai, toh wo message context mein jaata hai
  const prompt = context
    ? `Pichla message (context):\n${context.slice(0, 1500)}\n\nUser ka naya message: ${text}`
    : text;

  const errors = [];
  for (const [name, fn] of providers) {
    try {
      return await fn(prompt);
    } catch (e) {
      errors.push(`${name}: ${e.message}`);
    }
  }

  console.error(errors.join(" | "));
  const owner = process.env.OWNER_CHAT_ID;
  if (owner) {
    try {
      await tg("sendMessage", {
        chat_id: owner,
        text: ("⚠️ Bot error (teeno AI fail):\n" + errors.join("\n")).slice(0, 3500),
      });
    } catch (e) {
      console.error("Owner alert fail:", e.message);
    }
  }
  return `😅 Aaj ka AI limit abhi khatam ho gaya hai. Thodi der baad dobara try karo ⏳\n\n📢 Tab tak news dekho: ${CHANNEL}`;
}

const STICKER_MOODS = { sad: [0], cool: [1], pro: [2], hello: [3], cute: [4] };

const MOOD_WORDS = {
  hello: ["hi", "hii", "hello", "hey", "namaste", "hlo"],
  sad: ["sad", "dukhi", "rona", "udas", "bura", "haar", "😢", "😭"],
  pro: ["pro", "op", "best", "master", "expert", "boss", "insane", "legend"],
  cool: ["cool", "mast", "awesome", "nice", "badhiya", "sahi", "lit", "mazza"],
  cute: ["cute", "pyara", "love", "thanks", "thank", "shukriya", "❤️", "🥰"],
};

function pickSticker(text) {
  const t = text.toLowerCase();
  const words = t.match(/[a-z]+/g) || [];
  let mood = null;
  for (const m of Object.keys(MOOD_WORDS)) {
    const hit = MOOD_WORDS[m].some((k) =>
      /^[a-z]+$/.test(k) ? words.includes(k) : t.includes(k)
    );
    if (hit) {
      mood = m;
      break;
    }
  }
  if (mood) {
    if (Math.random() < 0.6) {
      const ids = STICKER_MOODS[mood];
      return STICKERS[ids[Math.floor(Math.random() * ids.length)]];
    }
    return null;
  }
  if (Math.random() < 0.08) {
    const pool = [1, 2, 4];
    return STICKERS[pool[Math.floor(Math.random() * pool.length)]];
  }
  return null;
}

// ---------------- SHADERS ----------------
// Preview photos aur SmooTea ki file Minecraft-Rapid-newsbot repo se aati hain.
const ASSET_BASE =
  process.env.ASSET_BASE ||
  "https://raw.githubusercontent.com/o10096570-design/Minecraft-Rapid-newsbot/main/";
const TUTORIAL_URL = "https://t.me/minecraftrapidnews/31";
const GROUP_URL = "https://t.me/+QhT_ms4D5WdjZmNl";
const SHADERS = [
  {
    key: "smootea", label: "SmooTea Shader", tier: "low", creator: "Azion Studios (AziFy)",
    aliases: ["smootea", "smoo tea", "smooth tea"],
    desc: "Low-end phones ke liye smooth shader. MB Loader chahiye.",
    url: "https://www.curseforge.com/minecraft-bedrock/texture-packs/azifysmootea",
    file: "SmooTea_v4.6.mcpack",
    imgs: ["smootea_1.jpg", "smootea_2.jpg", "smootea_3.jpg"],
  },
  {
    key: "dshader", label: "D'Shader", tier: "low", creator: "DrizarMC",
    aliases: ["d'shader", "d’shader", "dshader", "d shader"],
    desc: "Low-end phones ke liye halka shader, MB Loader nahi chahiye.",
    url: "https://www.curseforge.com/minecraft-bedrock/texture-packs/dshader-for-low-end-phones",
    file: "",
    imgs: ["dshader_1.jpg", "dshader_2.jpg", "dshader_3.jpg"],
  },
  {
    key: "rg", label: "RG Shader", tier: "low", creator: "RisabGamerz",
    aliases: ["rg shader", "rgshader", "rg"],
    desc: "Low-end phones ke liye shader jo blocks ko sundar banata hai.",
    url: "https://www.curseforge.com/minecraft-bedrock/texture-packs/rg-shader-v2-1-renderdragon-support-2",
    file: "",
    imgs: ["rgshader_1.jpg", "rgshader_2.jpg", "rgshader_3.jpg"],
  },
  {
    key: "solar", label: "Solar Shaders", tier: "medium", creator: "CraftStudio",
    aliases: ["solar"],
    desc: "Golden hour fog, god rays aur aurora. Thoda bhaari, medium phones ke liye.",
    url: "https://www.curseforge.com/minecraft-bedrock/texture-packs/solar-shaders",
    file: "",
    imgs: ["solar_1.jpg", "solar_2.jpg", "solar_3.jpg"],
  },
];

function detectShader(text) {
  const t = text.toLowerCase();
  for (const sh of SHADERS) {
    for (const a of sh.aliases) {
      const hit = a === "rg" ? /(^|[^a-z])rg([^a-z]|$)/.test(t) : t.includes(a);
      if (hit) return sh;
    }
  }
  return null;
}

// "shader do", "shader chahiye", "shader link" jaise sawaal pakadta hai.
// "shader kya hota hai" jaise sawaal AI ko jaate hain.
function isShaderRequest(text) {
  const t = text.toLowerCase();
  if (detectShader(t)) return /shader|download|link|file|chahiye|chaiye|do\b|dedo|de do|bhej|send|give|want|need/.test(t);
  if (!/shader|shaders|shedar|sheder/.test(t)) return false;
  return /\b(do|de|dedo|dena|chahiye|chaiye|chahie|download|link|file|send|bhej|bhejo|give|want|need|list|konsa|kaunsa|which|available|milega|mil jayega|best|get|share|provide|show|please|pls|plz|recommend|suggest|any|have)\b/.test(t);
}

function shaderMenuMarkup() {
  const rows = [];
  for (let i = 0; i < SHADERS.length; i += 2) {
    rows.push(
      SHADERS.slice(i, i + 2).map((s) => ({
        text: `${s.tier === "low" ? "📱" : "💪"} ${s.label}`,
        callback_data: "sh:" + s.key,
      }))
    );
  }
  return { inline_keyboard: rows };
}

const isEng = (t) => !/\b(do|de|dedo|dena|chahiye|chaiye|chahie|bhej|bhejo|konsa|kaunsa|mujhe|mereko|mujhko|hai|hain|kya|milega|batao|bata|aur|ek|koi|wala|wali|nahi|kar|karo)\b/i.test(t);
async function sendShaderMenu(chatId, replyTo, en) {
  const lines = SHADERS.map((s) => `${s.tier === "low" ? "📱 low-end" : "💪 medium"}  ${s.label}`).join("\n");
  await tg("sendMessage", {
    chat_id: chatId,
    text: en ? `🎮 Looking for a shader? Here's what's available:\n\n${lines}\n\nWhich one do you want? Pick below 👇` : `🎮 Shader chahiye? Ye available hain:\n\n${lines}\n\nKonsa chahiye? Neeche se chun lo 👇`,
    reply_markup: shaderMenuMarkup(),
    ...(replyTo ? { reply_parameters: { message_id: replyTo } } : {}),
  });
}

async function sendShader(chatId, sh, replyTo, en) {
  const photos = sh.imgs.map((f, i) => ({
    type: "photo",
    media: ASSET_BASE + f,
    ...(i === 0 ? { caption: `🎮 ${sh.label}\n${sh.desc}\n👤 Creator: ${sh.creator}` } : {}),
  }));
  let sentPhotos = false;
  try {
    const r = await tg("sendMediaGroup", {
      chat_id: chatId,
      media: photos,
      ...(replyTo ? { reply_parameters: { message_id: replyTo } } : {}),
    });
    sentPhotos = r.ok;
  } catch (e) {
    console.error("album fail:", e.message);
  }
  const rows = [];
  if (sh.file) rows.push([{ text: "⚡ Direct Download", url: ASSET_BASE + sh.file }]);
  rows.push([{ text: "⬇️ Official Download", url: sh.url }]);
  rows.push([{ text: "📖 How to install / Kaise lagayein", url: TUTORIAL_URL }]);
  rows.push([{ text: "💬 Join MineRapid CHAT", url: GROUP_URL }]);
  rows.push([{ text: en ? "🔁 Another shader" : "🔁 Doosra shader", callback_data: "sh:menu" }]);
  await tg("sendMessage", {
    chat_id: chatId,
    text: `${sentPhotos ? "" : `🎮 ${sh.label}\n${sh.desc}\n👤 Creator: ${sh.creator}\n\n`}${en ? "👇 Download and install from here:" : "👇 Download aur install yahan se:"}`,
    reply_markup: { inline_keyboard: rows },
    ...(!sentPhotos && replyTo ? { reply_parameters: { message_id: replyTo } } : {}),
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(200).send("Bot chal raha hai");
  if (SECRET && req.headers["x-telegram-bot-api-secret-token"] !== SECRET) {
    return res.status(401).send("no");
  }

  try {
    const cq = req.body?.callback_query;
    if (cq?.data?.startsWith("sh:")) {
      await tg("answerCallbackQuery", { callback_query_id: cq.id });
      const chatId = cq.message?.chat?.id;
      const key = cq.data.slice(3);
      if (chatId) {
        const sh = SHADERS.find((x) => x.key === key);
        if (sh) await sendShader(chatId, sh);
        else await sendShaderMenu(chatId);
      }
      return res.status(200).send("ok");
    }
    const msg = req.body?.message;
        if (msg?.sticker && String(msg.chat.id) === process.env.OWNER_CHAT_ID) {
      await tg("sendMessage", { chat_id: msg.chat.id, text: msg.sticker.file_id });
    }
        if (msg?.text === "/stickers" && String(msg.chat.id) === process.env.OWNER_CHAT_ID) {
      for (let i = 0; i < STICKERS.length; i++) {
        await tg("sendMessage", { chat_id: msg.chat.id, text: `Sticker ${i + 1}` });
        await tg("sendSticker", { chat_id: msg.chat.id, sticker: STICKERS[i] });
      }
      return res.status(200).send("ok");
    }
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
        let context = "";
        if (!isPrivate) {
          if (msg.from?.is_bot) return res.status(200).send("ok");

          const myId = BOT_TOKEN.split(":")[0];
          const isReplyToMe = String(msg.reply_to_message?.from?.id) === myId;
          const username = await getBotUsername();
          const mentioned =
            username && text.toLowerCase().includes("@" + username.toLowerCase());
          const lower = text.toLowerCase();
          const calledByName = BOT_NAMES.some((n) => lower.includes(n));
          const isAsk = text.startsWith("/ask");

          if (isAsk) {
            text = text.replace(/^\/ask(@\w+)?/, "").trim();
          } else if (text.startsWith("/")) {
            return res.status(200).send("ok"); // doosri commands ignore
          } else if (!(isReplyToMe || mentioned || calledByName)) {
            return res.status(200).send("ok"); // bot ko nahi bulaya, chup raho
          }

          if (mentioned) {
            text = text.replace(new RegExp("@" + username, "ig"), "").trim();
          }
          if (calledByName) {
            for (const n of BOT_NAMES) text = text.replace(new RegExp(n, "ig"), "");
            text = text.replace(/^[\s,:!.-]+/, "").trim();
            if (!text) text = "hi"; // sirf naam likha ho toh greeting
          }
          if (isReplyToMe) {
            context = msg.reply_to_message.text || msg.reply_to_message.caption || "";
          }
        }
        if (text) {
          if (isShaderRequest(text)) {
            const sh = detectShader(text);
            const rt = isPrivate ? undefined : msg.message_id;
            const en = isEng(text);
            if (sh) await sendShader(chatId, sh, rt, en);
            else await sendShaderMenu(chatId, rt, en);
            return res.status(200).send("ok");
          }
          await tg("sendChatAction", { chat_id: chatId, action: "typing" });
          let reply = stripMd(await answer(text, context)).slice(0, 3800);
          if (Math.random() < 0.3) reply += `\n\nDaily Minecraft news: ${CHANNEL}`;
          await tg("sendMessage", {
            chat_id: chatId,
            text: reply,
            // group mein jawab usi message pe reply ke roop mein aayega
            ...(isPrivate ? {} : { reply_parameters: { message_id: msg.message_id } }),
          });
                     const sticker = pickSticker(text);
          if (sticker) {
            await tg("sendSticker", { chat_id: chatId, sticker });
          }      
        }
      }
    }
  } catch (e) {
    console.error(e);
  }
  return res.status(200).send("ok");
}
