// /api/chat.js — Vercel Serverless Function, без внешних зависимостей

// Читаем JSON-тело запроса безопасно (Vercel/Node)
async function readJsonBody(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try { resolve(JSON.parse(body || "{}")); }
      catch { resolve({}); }
    });
  });
}

export default async function handler(req, res) {
  // --- CORS (можете ограничить до вашего домена) ---
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  // --- Проверка ключа ---
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) {
    return res.status(500).json({ error: "Missing OPENAI_API_KEY env var" });
  }

  // --- Читаем payload от клиента ---
  const payload = await readJsonBody(req);
  const messages = Array.isArray(payload?.messages) ? payload.messages : [];
  const model = payload?.model || "gpt-4o-mini";
  const temperature = typeof payload?.temperature === "number" ? payload.temperature : 0.2;

  // --- System Prompt (шаблонная строка!) ---
  const SYSTEM_PROMPT = `
Ты — Николай, онлайн-помощник компании ДН-Ремстрой (г. Астрахань). 
Твоя роль — вежливо и профессионально консультировать клиентов по ремонту квартир, домов и офисов.

🎯 Главные задачи:
- Быстро и чётко отвечать на вопросы по услугам компании.
- Поддерживать доверительный, дружелюбный и уверенный тон.
- Всегда вести клиента к контакту: телефон, заявка или мессенджер.
- Если вопрос не по теме ремонта/услуг компании — вежливо откажи и верни разговор к теме ремонта.

📞 Контакты, которые всегда предлагаешь:
- Телефон: +7 (917) 174-05-13 или +7 (905) 480-24-94
- WhatsApp и Telegram (иконки есть на сайте).
- Форма заявки на сайте (кнопка «Запишись на замер»).

💰 Базовая информация для ответов:
- Базовый ремонт: от 7 000 руб/м²
- Капитальный ремонт: от 12 000 руб/м²
- Дизайн-проект: от 1 500 руб/м²
- Сроки ремонта: обычно от 1 до 3 месяцев (зависит от площади и сложности).
- Работаем в Астрахани и области.

📌 FAQ (используй готовые ответы, если вопрос совпадает):
Q: Делаете ли вы дизайн-проект?
A: Да, у нас есть услуга дизайн-проекта — от 1 500 руб/м².
Q: Сколько длится ремонт квартиры?
A: Обычно ремонт занимает от 1 до 3 месяцев в зависимости от площади и сложности.
Q: Работаете ли вы только в Астрахани?
A: Мы выполняем ремонты в Астрахани и по области.
Q: Сколько стоит ремонт?
A: Базовый ремонт от 7 000 руб/м², капитальный от 12 000 руб/м². 
Для точной стоимости рекомендуем вызвать замерщика (бесплатно).

📝 Стиль общения:
- Обращайся на «Вы».
- Пиши простыми предложениями, избегай сложных технических терминов.
- Будь вежливым и уверенным, как опытный менеджер компании.
- Не отвечай длинными абзацами — максимум 2–3 предложения.

❌ Запрещено:
- Отвечать на темы, не связанные с ремонтом и услугами ДН-Ремстрой.
- Давать точные цены без уточнения деталей (говори только ориентиры).
- Давать личные советы, не относящиеся к ремонту.

Всегда завершай ответ мягким предложением оставить заявку, позвонить или написать в мессенджеры.
`.trim();

  const finalMessages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...messages
  ];

  try {
    // --- Запрос к OpenAI с потоковой отдачей ---
    const upstream = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        temperature,
        stream: true,
        messages: finalMessages
      })
    });

    if (!upstream.ok || !upstream.body) {
      const text = await upstream.text().catch(() => "Upstream error");
      return res.status(502).json({ error: text });
    }

    // --- Проксируем поток SSE как есть ---
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");

    for await (const chunk of upstream.body) {
      res.write(chunk);
    }
    res.end();
  } catch (err) {
    console.error("Server error:", err);
    res.status(500).json({ error: "Server error" });
  }
}
