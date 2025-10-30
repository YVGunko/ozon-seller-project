class TemplateService {
  constructor() {
    this.templates = {};
    this.loading = false;
  }

  async loadTemplates(templateName = 'ozon-templates') {
    try {
      this.loading = true;
      const response = await fetch(`/field-templates/${templateName}.json`);
      
      if (!response.ok) {
        throw new Error(`Ошибка загрузки шаблонов: ${response.status}`);
      }
      
      const templates = await response.json();
      this.templates = templates;
      this.loading = false;
      
      return templates;
    } catch (error) {
      console.error('Ошибка загрузки шаблонов:', error);
      this.loading = false;
      throw error;
    }
  }

  getTemplates() {
    return this.templates;
  }

  // Для будущего расширения - сохранение шаблонов
  async saveTemplates(templates, templateName = 'ozon-templates') {
    // Здесь будет логика сохранения на сервер
    // Пока просто обновляем локальные данные
    this.templates = templates;
    return Promise.resolve();
  }
}

export default new TemplateService();