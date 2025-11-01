const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

const buildPrompt = (rows, keywords, baseProductData) => {
  const baseInfo = [
    baseProductData?.category_id && `ID категории: ${baseProductData.category_id}`,
    baseProductData?.price && `Цена: ${baseProductData.price}`,
    baseProductData?.vat && `Ставка НДС: ${baseProductData.vat}`
  ]
    .filter(Boolean)
    .join(', ');

  const productChunks = rows
    .slice(0, 50)
    .map((row) => {
      const templateValues = row.templateValues || {};
      const parts = [
        `#${row.index + 1}`,
        templateValues.name && `Название: ${templateValues.name}`,
        row.carBrand && `Марка авто: ${row.carBrand}`,
        row.colourName && `Цвет: ${row.colourName}`,
        row.colourCode && `Код цвета: ${row.colourCode}`,
        row.ruCarBrand && `Русская марка: ${row.ruCarBrand}`,
        templateValues.part_number && `Партномер: ${templateValues.part_number}`
      ]
        .filter(Boolean)
        .join('\n');

      return parts;
    })
    .join('\n\n');

  return [
    'Ты профессиональный SEO-специалист компании «Ашманов и партнёры».',
    'Для каждого товара придумай три разных SEO-названия для карточки на маркетплейсе Ozon.',
    'Каждое название должно быть на русском языке, до 120 символов, отражать преимущества товара и отличаться по фокусу.',
    'Используй ключевые слова органично, избегай прямых повторов и дублирующихся конструкций.',
    'Не используй кавычки вокруг названий и не добавляй обозначения вида "(1)" или "-".',
    `Ключевые слова для вдохновения: ${keywords || 'не заданы'}.`,
    baseInfo && `Базовые параметры товара: ${baseInfo}.`,
    'Верни ответ строго в формате JSON: {"descriptions":[{"index":0,"description":"1) ...\\n2) ...\\n3) ..."}, ...]}.',
    'В каждой записи вместо "..." укажи три названия, разделённые переводом строки, с префиксами "1)", "2)", "3)".',
    'Не добавляй пояснений, комментариев или дополнительных полей.',
    'Данные товаров:',
    productChunks
  ]
    .filter(Boolean)
    .join('\n\n');
};

const parseAiResponse = (text) => {
  if (!text) {
    throw new Error('Пустой ответ от модели');
  }

  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    throw new Error('Не удалось распарсить ответ модели');
  }
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { rows, keywords, baseProductData } = req.body || {};

    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'Не переданы данные для генерации SEO названий' });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'OPENAI_API_KEY не задан в переменных окружения' });
    }

    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    const prompt = buildPrompt(rows, keywords, baseProductData);

    const openAiResponse = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content:
              'Ты SEO-специалист, который создаёт названия товаров для маркетплейса Ozon. Ответ всегда должен быть в формате JSON.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 900
      })
    });

    const data = await openAiResponse.json();

    if (!openAiResponse.ok) {
      const message = data?.error?.message || 'Ошибка при обращении к OpenAI';
      return res.status(openAiResponse.status).json({ error: message });
    }

    const content = data?.choices?.[0]?.message?.content;
    const parsed = parseAiResponse(content);
    const descriptions = Array.isArray(parsed?.descriptions) ? parsed.descriptions : parsed;

    if (!Array.isArray(descriptions)) {
      throw new Error('Ответ модели не содержит массива SEO названий');
    }

    const normalized = descriptions
      .filter((item) => typeof item?.index === 'number')
      .map((item) => ({
        index: item.index,
        description: String(item.description || '').trim()
      }));

    return res.status(200).json({ descriptions: normalized });
  } catch (error) {
    console.error('Ошибка генерации SEO названий:', error);
    return res.status(500).json({ error: error.message || 'Ошибка генерации SEO названий' });
  }
}
