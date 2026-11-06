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
        },

        // Neue Konten werden automatisch als ausstehende
        // CMS-Benutzer angelegt.
        databaseHooks: {
          user: {
            create: {
              after: async (user) => {
                await env.DB.prepare(`
                  INSERT INTO users (
                    id,
                    name,
                    email,
                    password_hash,
                    status,
                    is_owner
                  )
                  VALUES (?, ?, ?, ?, 'pending', 0)
                `)
                  .bind(
                    user.id,
                    user.name,
                    user.email,
                    "BETTER_AUTH_MANAGED"
                  )
                  .run();
              }
            }
          },

          // Verhindert, dass nicht freigegebene Benutzer
          // eine neue Sitzung erhalten.
          session: {
            create: {
              before: async (session) => {
                const cmsUser = await env.DB.prepare(`
                  SELECT status
                  FROM users
                  WHERE id = ?
                `)
                  .bind(session.userId)
                  .first();

                if (!cmsUser || cmsUser.status !== "approved") {
                  return false;
                }
              }
            }
          }
        }
      }
    )
  });
}
