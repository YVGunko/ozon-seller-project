import { getServerSession } from 'next-auth';
import { authOptions } from '../../../src/server/authOptions';
import { getAiPrompts, AiPromptMode } from '../../../src/modules/ai-prompts';

export default async function handler(req, res) {
  const promptsService = getAiPrompts();

  if (req.method === 'GET') {
    try {
      const { mode, scope = 'global' } = req.query || {};

      let normalizedMode = typeof mode === 'string' ? mode.toLowerCase() : undefined;
      if (normalizedMode === 'seo-name' || normalizedMode === 'title') {
        normalizedMode = AiPromptMode.SEO_NAME;
      }

      let userId = null;
      if (scope === 'user') {
        const session = await getServerSession(req, res, authOptions);
        if (!session) {
          return res.status(401).json({ error: 'Unauthorized' });
        }
        userId = session.user?.id || session.user?.email || null;
        if (!userId) {
          return res.status(401).json({ error: 'Invalid user session' });
        }
      }

      const prompts = await promptsService.listPromptsByUser(
        scope === 'user' ? userId : null,
        normalizedMode
      );

      return res.status(200).json({ prompts });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[api/ai/prompts][GET] error', error);
      return res
        .status(500)
        .json({ error: error?.message || 'Internal server error' });
    }
  }

  if (req.method === 'POST') {
    try {
      const {
        mode,
        scope = 'global',
        title,
        description,
        systemTemplate,
        userTemplate,
        variablesSchema = null,
        isDefault = true
      } = req.body || {};

      if (!mode || typeof mode !== 'string') {
        return res.status(400).json({ error: 'mode is required' });
      }
      if (!title || typeof title !== 'string') {
        return res.status(400).json({ error: 'title is required' });
      }
      if (!systemTemplate || typeof systemTemplate !== 'string') {
        return res.status(400).json({ error: 'systemTemplate is required' });
      }
      if (!userTemplate || typeof userTemplate !== 'string') {
        return res.status(400).json({ error: 'userTemplate is required' });
      }

      let normalizedMode = mode.toLowerCase();
      if (normalizedMode === 'seo-name' || normalizedMode === 'title') {
        normalizedMode = AiPromptMode.SEO_NAME;
      }

      let userId = null;
      if (scope === 'user') {
        const session = await getServerSession(req, res, authOptions);
        if (!session) {
          return res.status(401).json({ error: 'Unauthorized' });
        }
        userId = session.user?.id || session.user?.email || null;
        if (!userId) {
          return res.status(401).json({ error: 'Invalid user session' });
        }
      }

      const prompt = await promptsService.createPrompt({
        userId,
        mode: normalizedMode,
        title: title.trim(),
        description: description || '',
        systemTemplate,
        userTemplate,
        variablesSchema,
        isDefault: Boolean(isDefault)
      });

      return res.status(200).json({ prompt });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[api/ai/prompts][POST] error', error);
      return res
        .status(500)
        .json({ error: error?.message || 'Internal server error' });
    }
  }

  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).json({ error: 'Method not allowed' });
}
