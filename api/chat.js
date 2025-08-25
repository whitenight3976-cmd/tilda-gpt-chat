// /api/chat.js — серверless-функция для Vercel
export default async function handler(req, res) {
  // --- CORS ---
  const origin = req.headers.origin || "";
  const allowedOrigins = [
    "https://dn-remstroy.ru",
    "https://www.dn-remstroy.ru",
    // если страница пока на tilda.ws — добавьте точный адрес:
    // "https://<your-project>.tilda.ws"
  ];
  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).end("Method Not Allowed");

  try {
    const { messages = [], system, temperature = 0.2, model = "gpt-4o-mini" } = req.body || {};
    const finalMessages = [];
    // Задаём системную роль (тон и контекст помощника)
    finalMessages.push({
      role: "system",
      content:
        system ||
        "Ты — вежливый помощник сайта dn-remstroy.ru. Отвечай кратко и по делу, предлагай оставить заявку/контакты, если вопрос про услуги."
    });
    if (Array.isArray(messages)) finalMessages.push(...messages);

    // Запрос к OpenAI (стрим)
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        temperature,
        stream: true,
        messages: finalMessages
      })
    });

    if (!r.ok || !r.body) {
      const text = await r.text().catch(() => "Upstream error");
      return res.status(500).json({ error: text });
    }

    // Проксируем поток клиенту (SSE)
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");

    const reader = r.body.getReader();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) res.write(value);
    }
    res.end();
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
}
