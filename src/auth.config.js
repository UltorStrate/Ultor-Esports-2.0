import { betterAuth } from "better-auth";

export const auth = betterAuth({
  baseURL: "https://ultor-esports-2-0.yoriba03.workers.dev",
  secret: "schema-generation-only-secret-not-for-production",
  database: {
    async query() {
      return [];
    },
    async execute() {
      return [];
    }
  },
  emailAndPassword: {
    enabled: true
  }
});
