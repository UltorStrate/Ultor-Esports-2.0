
import { betterAuth } from "better-auth";
import { withCloudflare } from "better-auth-cloudflare";

export function createAuth(env) {
  if (!env.DB) {
    throw new Error("D1 database binding DB is missing");
  }

  if (!env.BETTER_AUTH_SECRET) {
    throw new Error("BETTER_AUTH_SECRET is missing");
  }

  if (!env.BETTER_AUTH_URL) {
    throw new Error("BETTER_AUTH_URL is missing");
  }

  return betterAuth({
    ...withCloudflare(
      {
        d1Native: env.DB
      },
      {
        baseURL: env.BETTER_AUTH_URL,
        secret: env.BETTER_AUTH_SECRET,
        trustedOrigins: [
          "https://ultor-esports-2-0.yoriba03.workers.dev"
        ],
        emailAndPassword: {
          enabled: true,
          autoSignIn: false
        },
        user: {
          additionalFields: {
            accessStatus: {
              type: "string",
              required: false,
              defaultValue: "pending",
              input: false
            }
          }
        }
      }
    )
  });
}

