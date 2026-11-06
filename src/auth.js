
import { betterAuth } from "better-auth";
import { withCloudflare } from "better-auth-cloudflare";

export function createAuth(env, cf) {
  if (!env.DB) {
    throw new Error("D1 database binding DB is missing");
  }

  if (!env.BETTER_AUTH_SECRET || !env.BETTER_AUTH_URL) {
    throw new Error("Better Auth environment variables are missing");
  }

  return betterAuth({
    ...withCloudflare(
      {
        d1Native: env.DB,
        cf
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
        }
      }
    )
  });
}
