import { APIRequestContext, APIResponse } from "@playwright/test";

export class ApiHelper {
  constructor(private request: APIRequestContext) {}

  async get(endpoint: string, params?: Record<string, string | number>) {
    const response = await this.request.get(endpoint, { params, maxRedirects: 0 });
    return this.toResult(response);
  }

  async post(endpoint: string, data: Record<string, unknown>) {
    const response = await this.request.post(endpoint, { data, maxRedirects: 0 });
    return this.toResult(response);
  }

  async put(endpoint: string, data: Record<string, unknown>) {
    const response = await this.request.put(endpoint, { data, maxRedirects: 0 });
    return this.toResult(response);
  }

  async patch(endpoint: string, data: Record<string, unknown>) {
    const response = await this.request.patch(endpoint, { data, maxRedirects: 0 });
    return this.toResult(response);
  }

  async delete(endpoint: string) {
    const response = await this.request.delete(endpoint, { maxRedirects: 0 });
    return this.toResult(response);
  }

  private async toResult(response: APIResponse) {
    const body = await response.text();
    return {
      status: response.status(),
      data: body ? JSON.parse(body) : null,
      headers: response.headers(),
    };
  }
}
