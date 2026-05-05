import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { sql, initDb } from "./db.js";
import { isAdminEmail } from "./admin.js";

const secret =
  process.env.NEXTAUTH_SECRET ||
  process.env.AUTH_SECRET ||
  (process.env.NODE_ENV !== "production" ? "local-dev-only-secret" : undefined);

const providers = [
  CredentialsProvider({
    name: "Email",
    credentials: {
      email:    { label: "Email",    type: "email" },
      password: { label: "Password", type: "password" },
    },
    async authorize(credentials) {
      if (!credentials?.email || !credentials?.password) return null;
      const email = credentials.email.trim().toLowerCase();
      await initDb();
      const result = await sql`
        SELECT id, email, name, password_hash, role, is_active
        FROM users WHERE email = ${email} LIMIT 1
      `;
      const user = result.rows[0];
      if (!user || !user.password_hash) return null;
      if (user.is_active === false) return null;
      const ok = await bcrypt.compare(credentials.password, user.password_hash);
      if (!ok) return null;
      return { id: String(user.id), email: user.email, name: user.name, role: user.role };
    },
  }),
];

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    GoogleProvider({
      clientId:     process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    })
  );
}

export const authOptions = {
  secret,
  providers,
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 30 },
  pages: { signIn: "/auth/signin" },
  callbacks: {
    async jwt({ token, user }) {
      if (user?.email) {
        token.email = user.email.toLowerCase();
        token.isAdmin = isAdminEmail(user.email);
        try {
          await initDb();
          const uRow = await sql`
            SELECT id, role, is_active FROM users
            WHERE email = ${token.email} LIMIT 1
          `;
          if (uRow.rows[0]) {
            if (uRow.rows[0].is_active === false) {
              token.isAdmin = false;
              token.disabled = true;
              return token;
            }
            token.userId = uRow.rows[0].id;
            token.role   = uRow.rows[0].role;
            // DB role='admin' grants admin regardless of ADMIN_EMAILS env var
            if (uRow.rows[0].role === "admin") token.isAdmin = true;
          }
        } catch {
          // DB unavailable — fall back to env var check only
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.email   = token.email;
        session.user.isAdmin = !!token.isAdmin;
        session.user.userId  = token.userId;
        session.user.role    = token.role;
      }
      return session;
    },
    async redirect({ url, baseUrl }) {
      if (url.startsWith("/")) return `${baseUrl}${url}`;
      if (url.startsWith(baseUrl)) return url;
      return baseUrl;
    },
  },
};
