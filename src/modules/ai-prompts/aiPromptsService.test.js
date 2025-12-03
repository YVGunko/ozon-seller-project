import { AiPromptsService } from './aiPromptsService';
import { AiPromptsAdapter } from './promptsAdapter';
import { AiPromptMode } from './types';

class InMemoryPromptsAdapter extends AiPromptsAdapter {
  constructor() {
    super();
    this.items = [];
  }

  async savePrompt(prompt) {
    const existingIndex = this.items.findIndex((p) => p.id === prompt.id);
    if (existingIndex >= 0) {
      this.items[existingIndex] = prompt;
    } else {
      this.items.push(prompt);
    }
    return prompt;
  }

  async getPromptById(id) {
    return this.items.find((p) => p.id === id) || null;
  }

  async listPromptsByUser(userId, mode) {
    return this.items.filter(
      (p) =>
        p.userId === userId &&
        (!mode || p.mode === mode)
    );
  }

  async deletePromptById(id) {
    const before = this.items.length;
    this.items = this.items.filter((p) => p.id !== id);
    return this.items.length < before;
  }
}

describe('AiPromptsService', () => {
  test('createPrompt and getActivePrompt (global)', async () => {
    const adapter = new InMemoryPromptsAdapter();
    const service = new AiPromptsService(adapter);

    const created = await service.createPrompt({
      userId: null,
      mode: AiPromptMode.SEO_NAME,
      title: 'Default SEO-name',
      description: 'Глобальный промпт для SEO-названий',
      systemTemplate: 'system',
      userTemplate: 'user',
      isDefault: true
    });

    expect(created.id).toBeDefined();
    expect(created.isDefault).toBe(true);

    const active = await service.getActivePrompt({
      userId: null,
      mode: AiPromptMode.SEO_NAME
    });

    expect(active.id).toBe(created.id);
  });

  test('setDefaultPrompt switches default within same (user, mode)', async () => {
    const adapter = new InMemoryPromptsAdapter();
    const service = new AiPromptsService(adapter);

    const p1 = await service.createPrompt({
      userId: 'u1',
      mode: AiPromptMode.SEO_NAME,
      title: 'Prompt 1',
      systemTemplate: 'sys1',
      userTemplate: 'user1',
      isDefault: true
    });

    const p2 = await service.createPrompt({
      userId: 'u1',
      mode: AiPromptMode.SEO_NAME,
      title: 'Prompt 2',
      systemTemplate: 'sys2',
      userTemplate: 'user2',
      isDefault: false
    });

    await service.setDefaultPrompt({
      userId: 'u1',
      mode: AiPromptMode.SEO_NAME,
      promptId: p2.id
    });

    const list = await service.listPromptsByUser('u1', AiPromptMode.SEO_NAME);
    const defaults = list.filter((p) => p.isDefault);
    expect(defaults).toHaveLength(1);
    expect(defaults[0].id).toBe(p2.id);
  });
});

