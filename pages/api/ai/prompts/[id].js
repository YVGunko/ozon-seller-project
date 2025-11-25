import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../src/server/authOptions';
import { getAiPrompts } from '../../../../src/modules/ai-prompts';

export default async function handler(req, res) {
  const {
    query: { id }
  } = req;

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Prompt id is required' });
  }

  if (req.method !== 'PATCH') {
    res.setHeader('Allow', ['PATCH']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // На будущее: при необходимости можно ограничить
    // редактирование только владельцем промпта.
    await getServerSession(req, res, authOptions);

    const {
      title,
      description,
      systemTemplate,
      userTemplate,
      variablesSchema,
      isDefault,
      mode
    } = req.body || {};

    const patch = {};

    if (typeof title === 'string') patch.title = title;
    if (typeof description === 'string') patch.description = description;
    if (typeof systemTemplate === 'string') patch.systemTemplate = systemTemplate;
    if (typeof userTemplate === 'string') patch.userTemplate = userTemplate;
    if (variablesSchema !== undefined) patch.variablesSchema = variablesSchema;
    if (typeof isDefault === 'boolean') patch.isDefault = isDefault;
    if (typeof mode === 'string') patch.mode = mode.toLowerCase();

    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: 'Nothing to update' });
    }

    const promptsService = getAiPrompts();
    const updated = await promptsService.updatePrompt(id, patch);

    return res.status(200).json({ prompt: updated });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[api/ai/prompts/[id]] error', error);

    if (error?.message?.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }

    return res
      .status(500)
      .json({ error: error?.message || 'Internal server error' });
  }
}

