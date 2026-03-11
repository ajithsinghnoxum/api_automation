import dotenv from "dotenv";

dotenv.config();

export type AuthType = "none" | "basic" | "bearer" | "api-key";

export const ENV = {
  BASE_URL:
    process.env.BASE_URL || "https://jsonplaceholder.typicode.com",
  AUTH_TYPE: (process.env.AUTH_TYPE || "none") as AuthType,
  API_TOKEN: process.env.API_TOKEN || "",
  BASIC_AUTH_USERNAME: process.env.BASIC_AUTH_USERNAME || "",
  BASIC_AUTH_PASSWORD: process.env.BASIC_AUTH_PASSWORD || "",
  API_KEY: process.env.API_KEY || "",
  API_KEY_HEADER: process.env.API_KEY_HEADER || "X-API-Key",
};

export function getAuthHeaders(): Record<string, string> {
  switch (ENV.AUTH_TYPE) {
    case "bearer":
      return { Authorization: `Bearer ${ENV.API_TOKEN}` };
    case "basic": {
      const credentials = Buffer.from(
        `${ENV.BASIC_AUTH_USERNAME}:${ENV.BASIC_AUTH_PASSWORD}`
      ).toString("base64");
      return { Authorization: `Basic ${credentials}` };
    }
    case "api-key":
      return { [ENV.API_KEY_HEADER]: ENV.API_KEY };
    case "none":
    default:
      return {};
  }
}
