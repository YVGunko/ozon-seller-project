import { useState, useEffect } from 'react';
import templateService from '../services/templateService';

const useFieldTemplates = (templateName = 'ozon-templates') => {
  const [fieldMappings, setFieldMappings] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadTemplates();
  }, [templateName]);

  const loadTemplates = async () => {
    try {
      setLoading(true);
      setError(null);
      const templates = await templateService.loadTemplates(templateName);
      setFieldMappings(templates);
    } catch (err) {
      setError(err.message);
      console.error('Ошибка загрузки шаблонов:', err);
    } finally {
      setLoading(false);
    }
  };

  const updateFieldMapping = (fieldKey, updates) => {
    setFieldMappings(prev => ({
      ...prev,
      [fieldKey]: {
        ...prev[fieldKey],
        ...updates
      }
    }));
  };

  const updateTemplate = (fieldKey, template) => {
    updateFieldMapping(fieldKey, { template });
  };

  const toggleField = (fieldKey) => {
    updateFieldMapping(fieldKey, { 
      enabled: !fieldMappings[fieldKey]?.enabled 
    });
  };

  const saveTemplates = async () => {
    try {
      await templateService.saveTemplates(fieldMappings, templateName);
      return true;
    } catch (error) {
      console.error('Ошибка сохранения шаблонов:', error);
      return false;
    }
  };

  return {
    fieldMappings,
    loading,
    error,
    updateTemplate,
    updateFieldMapping,
    toggleField,
    reloadTemplates: loadTemplates,
    saveTemplates
  };
};

export default useFieldTemplates;