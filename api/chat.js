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
        "Ты — Николай, онлайн-помощник компании ДН-Ремстрой (г. Астрахань). 
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
`"
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
