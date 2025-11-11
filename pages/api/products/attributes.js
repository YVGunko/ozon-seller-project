// pages/api/attributes.js
import { OzonApiService } from '../../../src/services/ozon-api';
import { addRequestLog } from '../../../src/server/requestLogStore';

const STATUS_CHECK_DELAY_MS = 5000;

const buildDescriptionAttributeKey = (descriptionCategoryId, typeId) => {
  return `${descriptionCategoryId ?? 'none'}:${typeId ?? 'none'}`;
};

const getAttributeValueLabel = (valueEntry) => {
  if (!valueEntry) return '';
  return (
    valueEntry?.value ??
    valueEntry?.text ??
    valueEntry?.value_text ??
    ''
  );
};

const getAttributeValueDictionaryId = (valueEntry) => {
  if (!valueEntry) return null;
  const raw =
    valueEntry?.dictionary_value_id ??
    valueEntry?.dictionaryValueId ??
    valueEntry?.value_id ??
    valueEntry?.id;
  if (raw === undefined || raw === null) return null;
  return String(raw);
};

const parseProfile = (rawProfile) => {
  if (!rawProfile) {
    throw new Error('Missing OZON profile');
  }

  if (typeof rawProfile === 'string') {
    try {
      return JSON.parse(decodeURIComponent(rawProfile));
    } catch {
      throw new Error('Invalid profile format');
    }
  }

  return rawProfile;
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const buildStatusCheckMessage = (item = {}) => {
  const statuses = item.statuses || {};
  const statusName = statuses.status_name ?? statuses.statusName ?? '—';
  const statusDescription =
    statuses.status_description ?? statuses.statusDescription ?? '—';
  const statusTooltip = statuses.status_tooltip ?? statuses.statusTooltip ?? '';

  const lines = [
    'Проверяю статус карточки...',
    `🧾 Статус карточки: ${statusName}`,
    `📄 Описание: ${statusDescription}`
  ];

  if (statusTooltip) {
    lines.push(`💬 Подсказка: ${statusTooltip}`);
  }

  if (
    typeof statusDescription === 'string' &&
    statusDescription.trim().toLowerCase() === 'не обновлен'
  ) {
    lines.push(
      '⚠️ Изменения не применились — проверь историю обновлений или блокировку поля.'
    );
  }

  return {
    offer_id: item.offer_id ?? item.offerId ?? null,
    statusName,
    statusDescription,
    statusTooltip,
    message: lines.join('\n')
  };
};

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const { offer_id, profile } = req.query;

      if (!offer_id) {
        return res.status(400).json({ error: 'Missing offer_id' });
      }

      const parsedProfile = parseProfile(profile);

      const { ozon_client_id, ozon_api_key } = parsedProfile || {};
      if (!ozon_client_id || !ozon_api_key) {
        return res.status(400).json({
          error: 'Profile must include ozon_client_id and ozon_api_key'
        });
      }

      const ozon = new OzonApiService(ozon_api_key, ozon_client_id);

      const result = await ozon.getProductAttributes(offer_id);
      const products = Array.isArray(result?.result) ? result.result : [];

      const combos = new Map();
      const productsByCombo = new Map();

      products.forEach((product) => {
        const descriptionCategoryId = product?.description_category_id;
        const typeId = product?.type_id;

        if (!descriptionCategoryId || !typeId) {
          return;
        }

        const key = buildDescriptionAttributeKey(descriptionCategoryId, typeId);
        if (!combos.has(key)) {
          combos.set(key, { descriptionCategoryId, typeId });
        }
        if (!productsByCombo.has(key)) {
          productsByCombo.set(key, []);
        }
        productsByCombo.get(key).push(product);
      });

      const metaByCombo = {};

      for (const [key, combo] of combos.entries()) {
        try {
          const attributesResponse = await ozon.getDescriptionCategoryAttributes(
            combo.descriptionCategoryId,
            combo.typeId
          );

          const attributesList = Array.isArray(attributesResponse?.result)
            ? attributesResponse.result
            : [];

          const productsInCombo = productsByCombo.get(key) || [];

          const enrichedAttributes = await Promise.all(
            attributesList.map(async (attributeMeta) => {
              const attributeId = attributeMeta?.id ?? attributeMeta?.attribute_id;
              const hasDictionary = attributeMeta?.dictionary_id;

              if (!attributeId || !hasDictionary) {
                return attributeMeta;
              }

              const attributeValues = [];
              productsInCombo.forEach((product) => {
                (product.attributes || []).forEach((attr) => {
                  const attrId = attr?.id ?? attr?.attribute_id;
                  if (String(attrId) === String(attributeId)) {
                    (attr.values || []).forEach((valueEntry) => {
                      attributeValues.push(valueEntry);
                    });
                  }
                });
              });

              try {
                const dictionaryResponse = await ozon.getAttributeDictionaryValues({
                  attribute_id: attributeId,
                  description_category_id: combo.descriptionCategoryId,
                  language: 'DEFAULT',
                  last_value_id: 0,
                  limit: 100,
                  type_id: combo.typeId
                });

                let dictionaryValues = Array.isArray(dictionaryResponse?.result)
                  ? dictionaryResponse.result
                  : [];
                const dictionaryValueIds = new Set(
                  dictionaryValues
                    .map(
                      (option) =>
                        option?.dictionary_value_id ??
                        option?.value_id ??
                        option?.id
                    )
                    .filter((val) => val !== undefined && val !== null)
                    .map(String)
                );

                const searchPromises = [];
                const seenSearchLabels = new Set();

                attributeValues.forEach((valueEntry) => {
                  const label = getAttributeValueLabel(valueEntry);
                  const dictionaryId = getAttributeValueDictionaryId(valueEntry);
                  if (dictionaryId && !dictionaryValueIds.has(dictionaryId)) {
                    if (label && !seenSearchLabels.has(label)) {
                      seenSearchLabels.add(label);
                      searchPromises.push(
                        ozon
                          .searchAttributeDictionaryValues({
                            attribute_id: attributeId,
                            description_category_id: combo.descriptionCategoryId,
                            type_id: combo.typeId,
                            language: 'DEFAULT',
                            limit: 50,
                            value: label
                          })
                          .then((searchResponse) => {
                            const searchResults = Array.isArray(searchResponse?.result)
                              ? searchResponse.result
                              : [];
                            return searchResults;
                          })
                          .catch((searchError) => {
                            console.error('Failed to search dictionary values', {
                              attributeId,
                              descriptionCategoryId: combo.descriptionCategoryId,
                              typeId: combo.typeId,
                              value: label,
                              message: searchError?.message || searchError
                            });
                            return [];
                          })
                      );
                    }
                  }
                });

                if (searchPromises.length) {
                  const searchResultsList = await Promise.all(searchPromises);
                  searchResultsList.forEach((searchResults) => {
                    searchResults.forEach((option) => {
                      const optionId =
                        option?.dictionary_value_id ??
                        option?.value_id ??
                        option?.id;
                      if (optionId !== undefined && optionId !== null) {
                        const idStr = String(optionId);
                        if (!dictionaryValueIds.has(idStr)) {
                          dictionaryValueIds.add(idStr);
                          dictionaryValues.push(option);
                        }
                      }
                    });
                  });
                }

                return {
                  ...attributeMeta,
                  dictionary_values: dictionaryValues
                };
              } catch (dictionaryError) {
                console.error('Failed to fetch dictionary values', {
                  attributeId,
                  descriptionCategoryId: combo.descriptionCategoryId,
                  typeId: combo.typeId,
                  message: dictionaryError?.message || dictionaryError
                });
                return attributeMeta;
              }
            })
          );

          metaByCombo[key] = enrichedAttributes;
        } catch (metaError) {
          console.error('Failed to fetch description-category attributes', {
            descriptionCategoryId: combo.descriptionCategoryId,
            typeId: combo.typeId,
            message: metaError?.message || metaError
          });
          metaByCombo[key] = [];
        }
      }

      const enrichedProducts = products.map((product) => {
        const key = buildDescriptionAttributeKey(product?.description_category_id, product?.type_id);

        return {
          ...product,
          available_attributes: metaByCombo[key] || []
        };
      });

      return res.status(200).json({
        ...result,
        result: enrichedProducts
      });
    }

    if (req.method === 'POST') {
      const startTime = Date.now();
      let statusCode = 200;
      let responseBody = null;
      let parsedProfile = null;
      let offerIdForLog = '';
      let useImportMode = false;

      try {
        const { items, profile, mode } = req.body || {};
        useImportMode = mode === 'import';

        if (!Array.isArray(items) || items.length === 0) {
          statusCode = 400;
          responseBody = { error: 'Не переданы товары для обновления' };
          res.status(statusCode).json(responseBody);
          return;
        }

        parsedProfile = parseProfile(profile);
        const { ozon_client_id, ozon_api_key } = parsedProfile || {};

        if (!ozon_client_id || !ozon_api_key) {
          statusCode = 400;
          responseBody = { error: 'Profile must include ozon_client_id and ozon_api_key' };
          res.status(statusCode).json(responseBody);
          return;
        }

        offerIdForLog = String(items?.[0]?.offer_id || items?.[0]?.offerId || '');

        const ozon = new OzonApiService(ozon_api_key, ozon_client_id);

        const updateResult = useImportMode
          ? await ozon.importProductAttributes(items)
          : await ozon.updateProductAttributes(items);
        const taskId = updateResult?.result?.task_id;

        let statusResult = null;
        if (taskId) {
          try {
            statusResult = await ozon.getProductImportStatus(taskId);
          } catch (statusError) {
            statusResult = {
              error: statusError.message || 'Не удалось получить статус задачи'
            };
          }
        }

        const offerIdsForStatusCheck = Array.isArray(items)
          ? items
              .map((item) => item?.offer_id ?? item?.offerId ?? null)
              .filter((id) => id !== null && id !== undefined)
              .map(String)
          : [];

        let statusCheck = null;

        if (offerIdsForStatusCheck.length) {
          try {
            await wait(STATUS_CHECK_DELAY_MS);
            const infoResponse = await ozon.getProductInfoList(offerIdsForStatusCheck);
            const infoItems = Array.isArray(infoResponse?.items)
              ? infoResponse.items
              : Array.isArray(infoResponse?.result?.items)
              ? infoResponse.result.items
              : [];
            const primaryOfferId = offerIdsForStatusCheck[0];
            const matchedItem =
              infoItems.find(
                (entry) =>
                  String(entry?.offer_id ?? entry?.offerId ?? '') === primaryOfferId
              ) || infoItems[0];

            if (matchedItem) {
              const report = buildStatusCheckMessage(matchedItem);
              statusCheck = {
                offer_id: report.offer_id ?? primaryOfferId,
                status_name: report.statusName,
                status_description: report.statusDescription,
                status_tooltip: report.statusTooltip,
                message: report.message
              };
            } else {
              statusCheck = {
                offer_id: primaryOfferId,
                error: 'Не удалось найти товар в списке статусов'
              };
            }
          } catch (statusCheckError) {
            statusCheck = {
              error:
                statusCheckError?.message ||
                'Не удалось получить актуальный статус карточки'
            };
          }
        }

        statusCode = 200;
        responseBody = {
          update: updateResult,
          status: statusResult,
          status_check: statusCheck
        };

        res.status(statusCode).json(responseBody);
      } catch (error) {
        statusCode = error.status || 500;
        responseBody = {
          error: error.message || 'Ошибка при обновлении атрибутов'
        };

        res.status(statusCode).json(responseBody);
      } finally {
        const duration = Date.now() - startTime;
        try {
          addRequestLog({
            offer_id: offerIdForLog,
            endpoint: useImportMode
              ? '/v3/product/import'
              : '/v1/product/attributes/update',
            method: 'POST',
            status: statusCode,
            duration_ms: duration,
            error_message: statusCode >= 400 ? responseBody?.error || null : null,
            user_id: parsedProfile?.user_id || parsedProfile?.userId || 'local-user',
            task_id: responseBody?.update?.result?.task_id || null
          });
        } catch (logError) {
          console.error('Failed to record request log:', logError);
        }
      }

      return;
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('❌ /api/attributes error:', error);
    return res.status(500).json({
      error: 'Failed to process attributes request',
      details: error.message
    });
  }
}
