class TranslationService {
    constructor() {
        this.colorTranslations = {};
        this.brandTranslations = {};
        this.isLoaded = false;
    }

    // Загрузка таблиц из JSON-файлов
    async loadTranslations() {
        try {
            // Проверяем, находимся ли мы в браузере
            if (typeof window === 'undefined') {
                console.log('Running on server, skipping translation load');
                this.loadFallbackTranslations();
                return;
            }

            console.log('Loading translation tables...');
            
            // Используем PUBLIC_URL для корректных путей
            const basePath = process.env.PUBLIC_URL || '';
            
            const [colorResponse, brandResponse] = await Promise.all([
                fetch(`${basePath}/translations/colors.json`),
                fetch(`${basePath}/translations/car-brands.json`)
            ]);

            if (!colorResponse.ok || !brandResponse.ok) {
                throw new Error('Failed to load translation tables');
            }

            const colorsRaw = await colorResponse.json();
            const brandsRaw = await brandResponse.json();

            this.colorTranslations = this.normalizeDictionaryKeys(colorsRaw);
            this.brandTranslations = this.normalizeDictionaryKeys(brandsRaw);
            this.isLoaded = true;
            
            console.log('Translation tables loaded successfully');
        } catch (error) {
            console.error('Error loading translation tables:', error);
            // Можно добавить fallback на базовые значения
            this.loadFallbackTranslations();
        }
    }

    // Fallback на случай если файлы не загрузятся
    loadFallbackTranslations() {
        this.colorTranslations = this.normalizeDictionaryKeys({
            'red': 'Красный',
            'blue': 'Синий',
            'green': 'Зеленый'
        });
        this.brandTranslations = this.normalizeDictionaryKeys({
            'fiat': 'Фиат',
            'toyota': 'Тойота',
            'bmw': 'БМВ'
        });
        this.isLoaded = true;
    }

    normalizeDictionaryKeys(dictionary = {}) {
        const normalized = {};
        Object.entries(dictionary || {}).forEach(([key, value]) => {
            if (typeof key !== 'string') return;
            const normalizedKey = key.toLowerCase();
            normalized[normalizedKey] = value;
        });
        return normalized;
    }

    // Поиск цвета с проверкой загрузки
    async findColor(englishColor) {
        if (!this.isLoaded) {
            await this.loadTranslations();
        }
        
        if (!englishColor) return null;
        
        const normalizedColor = englishColor.toLowerCase().trim();
        return this.colorTranslations[normalizedColor] || null;
    }

    // Поиск бренда с проверкой загрузки
    async findBrand(englishBrand) {
        if (!this.isLoaded) {
            await this.loadTranslations();
        }
        
        if (!englishBrand) return null;
        
        const normalizedBrand = englishBrand.toLowerCase().trim();
        return this.brandTranslations[normalizedBrand] || null;
    }

    // Универсальный поиск
    async translate(value) {
        if (!this.isLoaded) {
            await this.loadTranslations();
        }
        
        return {
            color: await this.findColor(value),
            brand: await this.findBrand(value)
        };
    }

    // Принудительная перезагрузка таблиц (например, после изменения файлов)
    async reloadTranslations() {
        this.isLoaded = false;
        await this.loadTranslations();
    }

    // Динамическое добавление переводов (в runtime)
    addColorTranslation(english, russian) {
        this.colorTranslations[english.toLowerCase()] = russian;
    }

    addBrandTranslation(english, russian) {
        this.brandTranslations[english.toLowerCase()] = russian;
    }

    // Получение всех доступных данных (для отладки)
    getAvailableColors() {
        return Object.keys(this.colorTranslations);
    }

    getAvailableBrands() {
        return Object.keys(this.brandTranslations);
    }
}

// Создаем singleton экземпляр
const translationService = new TranslationService();

// Предзагрузка таблиц при инициализации
translationService.loadTranslations();

export default translationService;
