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

            this.colorTranslations = await colorResponse.json();
            this.brandTranslations = await brandResponse.json();
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
        this.colorTranslations = {
            'red': 'Красный',
            'blue': 'Синий',
            'green': 'Зеленый'
        };
        this.brandTranslations = {
            'fiat': 'Фиат',
            'toyota': 'Тойота',
            'bmw': 'БМВ'
        };
        this.isLoaded = true;
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