
import { betterAuth } from "better-auth";
import { withCloudflare } from "better-auth-cloudflare";

export const auth = betterAuth({
  ...withCloudflare(
    {
      d1Native: {
        database: {
          prepare() {
            throw new Error("Schema generation only");
          }
        }
      }
    },
    {
      baseURL: "https://ultor-esports-2-0.yoriba03.workers.dev",
      secret: "schema-generation-only-secret-not-for-production",
      emailAndPassword: {
        enabled: true,
        autoSignIn: false
      }
    }
  )
});

