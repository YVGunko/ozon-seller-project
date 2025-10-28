import OzonSellerApiClient from 'ozon-daytona-seller-api';

export interface IOzonAdapter {
  getOrders(params: any): Promise<any>;
  // Добавьте другие методы по мере необходимости
}

export class OzonAdapter implements IOzonAdapter {
  private api: OzonSellerApiClient;

  constructor(apiKey: string, clientId: string) {
    this.api = new OzonSellerApiClient(apiKey, clientId);
  }

  async getOrders(params: any): Promise<any> {
    try {
      // Пример реализации - уточните методы из документации SDK
      return await this.api.orders.getList(params);
    } catch (error) {
      console.error('Error fetching orders:', error);
      throw error;
    }
  }
}