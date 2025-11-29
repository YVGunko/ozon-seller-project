# Архитектура проекта ozon-seller-project

Этот документ фиксирует текущую целевую архитектуру проекта.  
Он описывает слои, основные доменные сущности и то, как связаны UI, API, интеграции с маркетплейсами и AI‑подсистема.

## 1. Слои проекта

Проект структурирован по слоям (от внешнего к внутреннему):

1. **UI (Next.js pages / React компоненты)**
   - Каталоги: `pages/*.js`, `pages/*/*.js`, `src/components/*`, `src/hooks/*`.
   - Отвечают только за представление и локальное состояние.
   - Общаются с backend **только через REST‑эндпоинты** в `pages/api/*`.

2. **API слой (Next.js API routes)**
   - Каталог: `pages/api/**`.
   - Тонкие контроллеры:
     - вызывают `resolveServerContext` для получения пользователя / профиля / enterprise / seller;
     - делегируют работу доменным сервисам или адаптерам;
     - формируют HTTP‑ответы (`res.status(...).json(...)`).
   - Логика в API должна быть минимальной.

3. **Server context / инфраструктура сервера**
   - Каталог: `src/server/*`.
   - Уровень авторизации:
     - `getAuthContext(req, res)` → `{ isAuthenticated, user }` — мягкий режим (не бросает ошибок).
     - `ensureAuth(req, res)` → тот же объект, но бросает `Error("Unauthorized")` с `statusCode = 401`, если пользователь не авторизован.
   - Новый «тонкий» контекст: `serverContextV2(req, res, options)`
     - используется через обёртку `withServerContext(handler, { requireAuth })` во всех новых API‑роутах;
     - выполняет:
       1. получение `auth` (через `ensureAuth` или `getAuthContext`);
       2. инициализацию конфигурации Enterprise/Seller (`ensureEnterprisesAndSellersSeeded`);
       3. создание `DomainResolver` и возврат доменного контекста:
          ```js
          {
            auth,                 // isAuthenticated + user
            domain: {
              user,
              enterprises,
              sellers,
              activeEnterprise,
              activeSellerIds
            },
            storage,              // configStorage (Redis)
            resolver              // экземпляр DomainResolver
          }
          ```
   - Старый `resolveServerContext(req, res, { requireProfile })` остаётся как слой совместимости для OZON‑профилей и пока используется в продуктовых/атрибутных API, но постепенно будет вытесняться доменным слоем.
   - Здесь же находятся хранилища логов запросов и прочая серверная инфраструктура.

4. **Доменный слой (`src/domain`)**
   - Чистая бизнес‑логика без привязки к Next.js или конкретным API.
   - Подкаталоги:
     - `src/domain/entities` — фабрики доменных сущностей;
     - `src/domain/services` — доменные сервисы.
   - Этот слой может вызываться как из API, так и потенциально из других приложений.

5. **Интеграционный / инфраструктурный слой (`src/modules`)**
   - Адаптеры к внешним системам:
     - Ozon API, AI‑провайдеры, Vercel Blob, Replicate и т.д.
   - Примеры:
     - `src/modules/marketplaces/ozonAdapter.js` — обёртка над Ozon API;
     - `src/modules/ai-storage` — сохранение результатов генераций;
     - `src/modules/ai-prompts` — библиотека AI‑промптов;
     - `src/utils/aiHelpers.js` — вспомогательные функции для вызова AI‑моделей.

6. **Shared utils**
   - Переиспользуемые функции форматирования, парсинга, вспомогательные утилиты.

Идея: зависимости направлены **вглубь** — UI знает об API, API знает о serverContext и домене, домен знает только об абстрактных интерфейсах адаптеров.

---

## 0. Конфигурация пользователей / профилей (Redis + Blob + .env)

### 0.1 Общая политика

- **Основной runtime‑источник конфигурации** — Redis‑хранилище через `configStorage`:
  - ключи:
    - `config:users` — пользователи, их роли и доступные продавцы;
    - `config:enterprises` — организации (Enterprise);
    - `config:sellers` — магазины (Seller) и привязка к Enterprise.
- JSON‑файлы и Blob используются как исходные данные для миграции и резервного хранения:
  - `config/users.json`, `config/profiles.json`, `config/enterprises.json`;
  - admin‑эндпоинты могут читать/писать эти файлы и синхронизировать их с Redis.
- Переменные окружения (`AUTH_USERS`, `ADMIN_*`, `OZON_PROFILES`, `OZON_*`) — **последний fallback**:
  - используются, если нет данных ни в Redis, ни в конфигурационных файлах/Blob;
  - после успешной записи в Redis дальнейшая работа идёт только через `configStorage`.

### 0.2 Users (`config:users`, `userStore`, `/api/admin/users`)

- Основное хранилище:
  - `configStorage.getUsers()/saveUsers()` поверх Redis (`config:users`).
- Загрузка пользователей (`userStore.getAuthUsers()`):
  1. Пытается прочитать пользователей из Redis через `configStorage.getUsers()`.
  2. Если данных нет — пытается прочитать `config/users.json` из локального файла (для удобной миграции).
  3. Если файла нет или он пуст — пробует прочитать конфиг из Blob `config/users.json`.
  4. Если и Blob отсутствует — использует `AUTH_USERS` / `ADMIN_*` из `.env`.
  - После любой успешной загрузки сохраняет нормализованный список обратно в Redis (`saveUsers`) и кэширует в памяти.
- Сохранение пользователей:
  - `/api/admin/users` работает поверх `configStorage`:
    - читает текущий список пользователей;
    - добавляет/обновляет запись (без возврата пароля наружу);
    - зовёт `configStorage.saveUsers(updatedUsers)`;
    - при необходимости может экспортировать JSON в Blob, но это вспомогательная операция.
- UI `/admin/users`:
  - работает только с `/api/admin/users` и `/api/profiles`;
  - показывает `*****` вместо пароля и кнопку «Изменить пароль»;
  - пароль отправляется в API только при создании пользователя или явной смене.

### 0.3 Profiles / Sellers (`config:sellers`, `profileStore`, `/api/admin/sellers`)

- Основное хранилище магазинов:
  - Redis (`configStorage.getSellers/saveSellers`), ключ `config:sellers`.
- Bootstrap и связь с файлами:
  - `profileStore.ensureProfilesLoaded()`:
    - пытается прочитать `config/profiles.json` из Blob или из репозитория;
    - при отсутствии файлов может собрать профили из `OZON_PROFILES` в `.env` и залогировать предупреждение;
    - эти данные затем используются `configBootstrap` для инициализации `config:sellers`.
- Сохранение профилей магазинов:
  - `/api/admin/sellers`:
    - отображает магазины и их привязку к Enterprise (по данным Redis);
    - root/admin может создавать/обновлять Seller:
      - `ozon_client_id`, `ozon_api_key`, `client_hint`, `description`;
      - при редактировании пустое `ozon_api_key` не затирает существующий ключ;
      - на фронт отдаётся только флаг `ozon_has_api_key`, сам ключ не возвращается.
    - обновляет привязку Seller к Enterprise (через `enterpriseId` и список `profileIds`);
    - сохраняет результат в Redis через `configStorage.saveSellers` и, при необходимости, экспортирует JSON в Blob.
- UI `/admin/sellers`:
  - отображает магазины и их привязку к Enterprise;
  - показывает звёздочки `*****` и красную подпись, если ключ уже сохранён;
  - для root/admin позволяет менять Enterprise через `<select>`, для manager поле Enterprise только для чтения.

### 0.4 Enterprises (`config:enterprises`, `enterpriseStore`, `/api/admin/enterprises`)

- Основное хранилище организаций:
  - Redis (`config:enterprises`), инициализируемый через `configBootstrap` из `config/enterprises.json` / Blob / env.
- `enterpriseStore`:
  - по‑прежнему умеет читать `config/enterprises.json` из Blob или репозитория;
  - используется как источник для начального заполнения Redis и для диагностики.
- API `/api/admin/enterprises`:
  - отдаёт список Enterprise с учётом прав:
    - root/admin — все;
    - manager — только те, к которым у него есть профили;
  - работа с изменениями Enterprise постепенно переносится на Redis через `configStorage.saveEnterprises`.

### 0.5 TODO по конфигурации

- Явно показывать в админке (users / sellers / enterprises), из какого слоя пришли данные:
  - Redis (основной), Blob / файл (bootstrap), ENV (аварийный режим).
- Добавить административный endpoint `/api/admin/config-status` для диагностики:
  - наличие и размеры `config:users`, `config:enterprises`, `config:sellers` в Redis;
  - состояние файлов/Blob‑конфигов;
  - использование ENV‑fallback’ов.
- Перенести хранение AI‑промптов с Blob‑файлов на Redis:
  - ввести отдельные ключи `config:ai-prompts:*` с доменной структурой;
  - оставить Blob как резервное хранилище/экспорт;
  - адаптировать `AiPromptsService` и API `/api/ai/prompts`, `/api/ai/prompts/[id]` к новому источнику.
‑‑‑

## 2. Доменные сущности

### 2.1 Root / Enterprise / Seller / User

Базовая модель многоарендности:

- **Root**
  - Логический «владелец» системы (уровень платформы).
  - В коде представлен простой фабрикой `createRoot` в `src/domain/entities/root.js`.

- **Enterprise**
  - Организация / бизнес‑сущность.
  - Фабрика: `createEnterprise({ id, rootId, name, slug?, settings? })`  
    (`src/domain/entities/enterprise.js`).
  - Может иметь несколько **Seller**ов (аккаунтов на маркетплейсах).

- **Seller**
  - Конкретный аккаунт на маркетплейсе (например, профиль OZON).
  - Фабрика: `createSeller({ id, enterpriseId, marketplace, name, externalIds, metadata })`  
    (`src/domain/entities/seller.js`).
  - `externalIds` используются для связи с реальными `client_id`, `profile_id` и т.п.

- **User**
  - Пользователь внутри Enterprise.
  - Фабрика: `createUser({ id, enterpriseId, email, name?, roles?, sellerIds? })`  
    (`src/domain/entities/user.js`).
  - Может иметь роли (admin / manager / content‑creator и т.п.) и доступ к одному или нескольким Seller.

### 2.2 Identity / DomainResolver

- Сервис `src/domain/services/identityMapping.js`:
  - по‑прежнему содержит вспомогательные мапперы для случаев, когда нужен явный объект Enterprise/Seller на основе профиля.

- Новый доменный резолвер: `src/domain/services/domainResolver.js`:
  - принимает `configStorage` и auth.user;
  - загружает пользователей, Enterprise и Seller из Redis;
  - строит `DomainContext`:
    ```js
    {
      user,
      enterprises,       // Enterprise, доступные пользователю
      sellers,           // Seller, доступные пользователю
      activeEnterprise,  // выбранный Enterprise (по id или по умолчанию)
      activeSellerIds    // один или несколько активных магазинов
    }
    ```
  - выполняет строгую проверку доступа:
    - нельзя выбрать `activeEnterpriseId` или `sellerId`, которые не принадлежат пользователю.

- `src/server/serverContextV2.js`:
  - склеивает `auth` + `configStorage` + `DomainResolver`;
  - используется во всех новых API‑роутах через `withServerContext`.

---

## 3. Marketplace‑адаптеры и работа с атрибутами

### 3.1 Абстрактный адаптер

В `src/domain/services/marketplaceAdapter.js` описывается базовый контракт:

- `MarketplaceAdapter` — базовый класс/интерфейс для всех маркетплейсов.
  - Пример метода: `fetchDescriptionAttributesForCombo(params)` — получить атрибуты по комбинации `description_category_id + type_id`.

### 3.2 OzonMarketplaceAdapter

В `src/modules/marketplaces/ozonAdapter.js`:

- `OzonMarketplaceAdapter` реализует интерфейс `MarketplaceAdapter` для OZON:
  - опирается на существующий сервис работы с Ozon API;
  - инкапсулирует детали запросов к `/v3/description-category/attribute` и связанным эндпоинтам.

### 3.3 AttributesService

В `src/domain/services/AttributesService.js`:

- `AttributesService.fetchDescriptionAttributesForCombo(adapter, params)`:
  - валидирует входные параметры;
  - вызывает соответствующий метод адаптера;
  - возвращает нормализованный набор атрибутов для UI.

### 3.4 API для описательных атрибутов

Роут `pages/api/products/description-attributes.js`:

- Получает OZON‑профиль через `resolveServerContext` (слой совместимости);
- Создаёт `OzonMarketplaceAdapter` для текущего Seller;
- Вызывает `AttributesService.fetchDescriptionAttributesForCombo`;
- Возвращает JSON, совместимый с текущим UI `/attributes`.

### 3.5 Продуктовые/атрибутные API через withServerContext

Ключевые продуктовые роуты переведены на единый шаблон:

```js
import { withServerContext } from '@/server/apiUtils';

async function handler(req, res, ctx) {
  const { auth, domain, storage } = ctx;
  // Текущая логика товаров/атрибутов пока использует resolveServerContext
  // для получения OZON‑профиля, но авторизация и доступ к Enterprise/Seller
  // уже проходят через serverContextV2.
}

export default withServerContext(handler, { requireAuth: true });
```

Сюда входят:

- продуктовые и атрибутные роуты:
  - `pages/api/products.js`, `pages/api/attention-products.js`;
  - `pages/api/products/attributes.js` и все вспомогательные файлы:
    - `barcodes.js`, `copy.js`, `description-attributes.js`, `description-tree.js`,
    - `import.js`, `import-prices.js`, `import-status.js`,
    - `info-list.js`, `info-prices.js`,
    - `net-price-latest.js`, `rating-by-sku.js`, `update-offer-id.js`;
- административные и служебные роуты (`/api/admin/*`, `/api/profiles`, `/api/logs`);
- AI‑роуты (`/api/ai/*`);
- загрузка файлов в Vercel Blob: `pages/api/uploads/blob.js`
  (обязательна авторизация, `withServerContext(handler, { requireAuth: true })`).

---

## 4. AI‑подсистема

### 4.1 aiHelpers + Groq

Файл `src/utils/aiHelpers.js` содержит:

- Функции подготовки промптов:
  - `buildSeoNamePrompt`, `buildSeoDescriptionPrompt`, `buildHashtagsPrompt`, `buildRichJsonPrompt`, `buildRichJsonPrompt`, `buildSlidesPrompt` (внутренняя логика).
- Функции генерации:
  - `generateSEOName`, `generateSEODescription`, `generateHashtags`, `generateRichJSON`, `generateSlides`.
  - `generate*WithPrompt` — варианты, которые принимают внешний промпт (AiPrompt).
- Общая вспомогательная логика:
  - `buildAiInputsFromProduct(product, { mode })` — превращает структуру товара и атрибутов в нормализованные входные данные для AI.
  - `parseJsonFromModel` — аккуратный парсинг JSON из текстового ответа модели.

Все AI‑запросы (SEO‑название, описание, хештеги, Rich, слайды) сведены к одному API‑роуту.

### 4.2 `/api/ai/product-seo`

Файл: `pages/api/ai/product-seo.js`.

- Принимает `POST { product, mode }`, где `mode` ∈:
  - `seo-name` (или `title`), `description`, `hashtags`, `rich`, `slides`.
- В зависимости от `mode`:
  - Строит базовый промпт (например, `buildSeoDescriptionPrompt`).
  - Пытается взять активный `AiPrompt` для соответствующего режима:
    - `AiPromptMode.SEO_NAME`, `SEO_DESCRIPTION`, `HASHTAGS`, `RICH`, `SLIDES`.
    - Если найден — **дополняет** базовый промпт (а не заменяет) и вызывает `generate*WithPrompt`.
    - Если нет — использует только базовый промпт и вызывает `generate*`.
- После успешной генерации:
  - через `resolveServerContext` берёт `user / enterprise / seller`;
  - логирует генерацию в `ai-storage` (см. ниже).

Ответ имеет вид:

```json
{
  "mode": "description",
  "items": [
    { "index": 0, "texts": ["вариант 1", "вариант 2", "вариант 3"] }
  ]
}
```

UI в `/attributes` использует эти данные для:

- модальной выборки SEO‑названий и описаний (когда вариантов несколько);
- заполнения атрибутов `#Хештеги` и `Rich‑контент JSON`;
- генерации структуры слайдов и последующей генерации изображений через отдельный API.

### 4.3 AiStorage (результаты генераций)

Каталог: `src/modules/ai-storage`.

Основные элементы:

- Тип `AiGeneration` (`types.js`):
  - `id`, `userId`, `enterpriseId?`, `sellerId?`,
  - `type`, `subType`, `mode`, `promptId?`,
  - `model`, `input`, `prompt`, `output`, `images[]`, `rawOutput?`, `createdAt`.
- `AiStorageService` (`aiStorageService.js`):
  - `createGeneration(params)` — собирает объект `AiGeneration` и сохраняет его через адаптер.
  - Методы чтения/удаления (для будущего UI истории генераций).
- Адаптер `BlobJsonAiStorageAdapter`:
  - сохраняет каждую генерацию как JSON в Vercel Blob;
  - структура путей: `ai/users/<userId>/<timestamp>-<type>-<subType>-<random>.json`.
- `getAiStorage()` (`serviceInstance.js`) — singleton‑фабрика сервиса.

### 4.4 AiPrompts (библиотека промптов)

Каталог: `src/modules/ai-prompts`.

- Тип `AiPrompt` (`types.js`):
  - `id`, `userId?`, `mode`, `scope` (`global`/`user`),
  - `title`, `description`,
  - `systemTemplate`, `userTemplate`,
  - `variablesSchema?`, `isDefault`, `isDeleted`, `createdAt`, `updatedAt`.
- `AiPromptsService` (`aiPromptsService.js`):
  - `createPrompt`, `updatePrompt`, `setDefaultPrompt`, `getActivePrompt`, `listPrompts`.
- Адаптер `BlobJsonPromptsAdapter`:
  - хранит промпты в Vercel Blob:
    - глобальные: `ai/prompts/_global/<id>-<random>.json`,
    - пользовательские: `ai/prompts/users/<userId>/<id>-<random>.json`.
- API:
  - `pages/api/ai/prompts.js` — создание и список промптов;
  - `pages/api/ai/prompts/[id].js` — обновление/смена default/soft‑delete.
- UI:
  - `pages/ai/prompts.js` — простая страница:
    - список промптов по mode;
    - форма редактирования выбранного промпта;
    - отметка `isDefault` и soft‑delete.

### 4.5 TODO по AI‑подсистеме

- Ограничить размер входных данных для AI‑запросов (особенно режима `hashtags`):
  - сейчас в промпт попадает полное текстовое описание + все атрибуты товара, что иногда приводит к ошибке Groq `Request Entity Too Large`;
  - нужно:
    - либо обрезать/сжимать вход (краткая сводка товара + ключевые атрибуты),
    - либо разбивать генерацию на несколько запросов по группам товаров.
  - Этот TODO не блокирует текущую работу, но важен для стабильности массовой генерации хештегов.
- Для режима `hashtags` добиться стабильного формата хештегов:
  - разделение слов символом подчёркивания (`#яркий_белый_свет`, а не `#яркийБелыйСвет` и не слова через пробел);
  - запрет смешения разных форматов внутри одного ответа;
  - при необходимости — дополнительная пост‑валидация и переработка списка на стороне сервера.
  - В `/attributes` явно показывать пользователю ошибку AI‑запроса (SEO‑название, описание, хештеги, Rich, слайды):
  - сейчас при ошибке `AI хештеги` сообщение видно только в серверных логах;
  - нужно добавить обработку ошибок на фронте и ненавязчивую подсказку/alert рядом с кнопкой AI.
- Улучшить UX страницы `/ai/prompts`:
  - добавить явный индикатор загрузки и блокировку формы на время запроса к `/api/ai/prompts`;
  - более наглядно отображать, какой промпт сейчас `isDefault` (по mode и scope);
  - визуально группировать промпты по режимам (`seo-name`, `description`, `hashtags`, `rich`, `slides`), чтобы избежать путаницы.

---

## 5. UI‑слой и основные экраны

### 5.1 Главная (`/`)

- Sidebar с:
  - профилем пользователя (из `useCurrentContext`);
  - текущим складом и переключателем складов;
  - навигацией: товары, заказы, акции/цены и т.п.
- Центральная часть:
  - пока простые блоки, в будущем — дашборд с метриками (заказы, контент‑рейтинг и т.д.).

### 5.2 Товары (`/products`, `/products/[offer_id]/attributes`)

- `/products`:
  - список товаров выбранного профиля;
  - быстрый фильтр по `offer_id`;
  - действия: открыть атрибуты, копировать товар, создать новый.

- `/products/[offer_id]/attributes`:
  - работа с атрибутами и обязательными параметрами товара:
    - навигация по группам слева (Обязательные, Фото, Общие, Прочие, Технические свойства);
    - стабильный порядок групп и атрибутов внутри (по id).
  - AI‑кнопки:
    - `AI SEO‑название` → модалка выбора одного из вариантов, затем запись в поле `Название`;
    - `AI описание` → модалка выбора варианта, запись в атрибут `Аннотация` (id 4191);
    - `AI хештеги` → прямое заполнение атрибута `#Хештеги` (id 23171) с валидацией;
    - `AI Rich JSON` → заполнение атрибута 11254 структурой Rich‑контента;
    - `AI слайды` → генерация структуры слайдов + кнопка «Сделать изображения слайдов» (через отдельный API).
  - TODO по UX атрибутов:
    - атрибуты с `type: Boolean` (например, «Признак 18+», id 9070) должны отображаться как явный выбор «Да/Нет» (toggle / radio), а не как свободное текстовое поле.

---

## 6. Контроль доступа: какие API что проверяют

Ниже таблица основных API‑роутов и guard‑функций из `src/domain/services/accessControl.js`, которые ограничивают доступ по ролям.

### 6.1 Товары / атрибуты / копирование

| Endpoint                                 | Метод(ы)       | Guard              | Кто имеет доступ                               |
|------------------------------------------|----------------|--------------------|------------------------------------------------|
| `/api/products/attributes`              | `GET`          | `canManageProducts`| admin, manager, content‑creator                |
| `/api/products/attributes`              | `POST`         | `canManageProducts`| admin, manager, content‑creator                |
| `/api/products/import`                  | `POST`         | `canManageProducts`| admin, manager, content‑creator                |
| `/api/products/copy`                    | `POST`         | `canManageProducts`| admin, manager, content‑creator                |
| `/api/products/update-offer-id`         | `POST`         | `canManageProducts`| admin, manager, content‑creator                |
| `/api/products/barcodes`                | `POST`         | `canManageProducts`| admin, manager, content‑creator                |
| `/api/products/description-tree`        | `POST`         | `canManageProducts`| admin, manager, content‑creator                |
| `/api/products/description-attributes`  | `POST`         | `canManageProducts`| admin, manager, content‑creator                |
| `/api/attention-products`               | `POST`         | `canManageProducts`| admin, manager, content‑creator                |

### 6.2 Цены и акции

| Endpoint                                   | Метод(ы)       | Guard               | Кто имеет доступ                               |
|--------------------------------------------|----------------|---------------------|------------------------------------------------|
| `/api/products/import-prices`             | `POST`         | `canManagePrices`   | admin, manager, finance                        |
| `/api/products/info-prices`               | `GET`, `POST`  | `canManagePrices`   | admin, manager, finance                        |
| `/api/products/net-price-latest`          | `POST`         | `canManagePrices`   | admin, manager, finance                        |
| `/api/actions/products`                   | `POST`         | `canManagePrices`   | admin, manager, finance                        |
| `/api/actions/candidates`                 | `POST`         | `canManagePrices`   | admin, manager, finance                        |
| `/api/actions/pricing-settings`           | `GET`, `POST`  | `canManagePrices`   | admin, manager, finance                        |
| `/api/products/rating-by-sku`             | `POST`         | `canManageProducts` **или** `canManagePrices` | admin, manager, content‑creator, finance |

### 6.3 Заказы / отправления

| Endpoint                         | Метод(ы) | Guard              | Кто имеет доступ                   |
|----------------------------------|----------|--------------------|------------------------------------|
| `/api/orders/postings`          | `POST`   | `canManageOrders`  | admin, manager, order             |

### 6.4 AI‑функции

| Endpoint                             | Метод(ы) | Guard                          | Описание                               |
|--------------------------------------|----------|--------------------------------|----------------------------------------|
| `/api/ai/product-seo`               | `POST`   | `canUseAiText(user, enterprise)` | SEO‑названия, описание, хештеги, rich, структура слайдов |
| `/api/ai/slide-images`              | `POST`   | `canUseAiImage(user, enterprise)`| Генерация изображений слайдов (Replicate / Flux) |

### 6.5 Админка и справочные данные

| Endpoint                               | Метод(ы)       | Guard                    | Кто имеет доступ                         |
|----------------------------------------|----------------|--------------------------|------------------------------------------|
| `/api/admin/users`                    | `GET`          | `canManageUsers`         | admin, manager                           |
| `/api/admin/enterprises`              | `GET`          | `canViewEnterprises`     | admin, manager                           |
| `/api/admin/enterprises`              | `POST`,`PATCH` | `canManageEnterprises`   | только admin (root‑уровень)              |
| `/api/logs`                           | `GET`          | `canViewLogs`            | admin, manager, finance                  |
| `/api/profiles`                       | `GET`          | авторизованный пользователь | возвращает только доступные профили |
| `/api/uploads/blob`                   | `POST`         | авторизованный пользователь | загрузка файлов/изображений в Blob   |

Эта таблица помогает быстро понять, почему конкретный пользователь получает `403 Forbidden` при обращении к тому или иному API и какие роли нужны для доступа.
  - Навигационные кнопки к ключевым AI‑атрибутам и кнопка «Наверх».

---

## 6. Тесты

- Конфигурация: `jest.config.cjs` (на базе `next/jest`).
- Уже покрыты юнит‑тестами:
  - `src/modules/ai-storage/aiStorageService.test.js`;
  - `src/modules/ai-prompts/aiPromptsService.test.js`;
  - `src/domain/services/identityMapping.test.js`;
  - `src/domain/services/AttributesService.test.js`.
- Общая идея:
 - тестировать доменные сервисы и модули (ai-storage, ai-prompts, attributes, identity);
  - API‑роуты и UI полагаются на стабильное поведение этих сервисов.

---

## 7. Куда двигаться дальше

Кратко о следующем этапе развития архитектуры:

1. **User / Enterprise / Seller админка**
   - Минимальный UI для просмотра пользователей, их enterprise и seller‑доступов.
   - Ролевые проверки для AI‑функций и управления промптами.

2. **Расширение доменных сервисов**
  - `ProductsService` (работа с товарами и ценами);
  - история цен/нетто‑цен с привязкой к `enterpriseId`/`sellerId`.

3. **Поддержка новых маркетплейсов**
   - Добавление новых адаптеров, реализующих интерфейс `MarketplaceAdapter`.
   - Переиспользование существующих доменных сервисов и UI‑слоя.

4. **TODO: Billing / тарифы Enterprise**
   - Ввести явное поле тарифа Enterprise (например, `billingPlan: "free" | "pro" | "enterprise"`).
   - Расширить `enterprise.settings.ai` лимитами и разрешёнными моделями:
     - `settings.ai.textEnabled / imageEnabled`;
     - `settings.ai.allowedTextModels / allowedImageModels`;
     - простые квоты по количеству запросов.
   - Связать это с access‑helper’ами (`canUseAiText`, `canUseAiImage`) и, при необходимости, логикой биллинга.

5. **TODO: Разграничение доступа по ролям к товарам**
   - Ввести helpers `canAccessProducts`, `canEditProducts`, `canEditAttributes`.
   - Ограничить роли `order` и `finance` только зонами заказов/отправлений/финансов, без доступа к редактированию товаров и атрибутов (возможен read‑only режим, обсуждается отдельно).
   - Использовать эти helpers в страницах `/products`, `/products/[offer_id]/attributes` и связанных API‑роутах.

Этот документ должен помогать ориентироваться в структуре проекта и принимать решения о дальнейшем рефакторинге и развитии без ломки уже работающих частей.

---

## 8. Конфигурация пользователей (AUTH_USERS / ADMIN_*)

Первичный источник пользователей — Redis (`config:users`), к которому доступ осуществляется через `configStorage` и `userStore` (см. раздел 0.2).

Переменные окружения `AUTH_USERS` / `ADMIN_*` используются **только как fallback‑слой**, когда:

- в Redis ещё нет ни одного пользователя;
- нет актуального `config/users.json` и Blob‑конфига.

Этот раздел фиксирует формат именно ENV‑конфигурации, которая может понадобиться для первоначального развёртывания или аварийного восстановления.

### 8.1 Формат AUTH_USERS

Переменная `AUTH_USERS` должна содержать JSON‑массив объектов вида:

```json
[
  {
    "id": "admin",
    "username": "admin@example.com",
    "password": "secret",
    "name": "Administrator",
    "profiles": ["3497256", "123456"],
    "roles": ["admin"],
    "email": "admin@example.com"
  }
]
```

Где:

- `id` — внутренний идентификатор пользователя (если не указан, берётся из `username`);
- `username` — логин для входа (обязателен);
- `password` — пароль для входа (обязателен);
- `name` — отображаемое имя (если не указано, используется `username`);
- `profiles` — массив доступных OZON‑профилей (строковые `profileId`);
- `roles` — массив ролей (например, `["admin"]`, `["manager"]`);
- `email` — email пользователя; если не указан, а `username` выглядит как email (`contains @`), то email берётся из `username`.

Эти поля приводятся к нормализованному виду в `src/server/userStore.js` и затем используются:

- для авторизации (`findUserByCredentials`);
- для построения доменных пользователей и отображения в `/admin/users`.

### 8.2 Fallback‑пользователь (ADMIN_*)

Если `AUTH_USERS` не задан, используется fallback‑конфигурация:

- `ADMIN_USER` — логин;
- `ADMIN_PASS` — пароль;
- `ADMIN_PROFILES` — запятая‑разделённый список `profileId`.

На их основе создаётся один пользователь:

```json
{
  "id": "admin",
  "username": "<ADMIN_USER>",
  "password": "<ADMIN_PASS>",
  "name": "Administrator",
  "profiles": ["..."],
  "roles": ["admin"],
  "email": "<ADMIN_USER if contains @>"
}
```

Этот пользователь:

- отображается на странице `/admin/users` (как `Пользователи (admin)`);
- имеет роль `admin` по умолчанию;
- имеет доступ только к тем профилям OZON, которые перечислены в `ADMIN_PROFILES`.
