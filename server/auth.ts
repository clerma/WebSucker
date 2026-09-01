import type { Express, Request, Response, NextFunction } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import bcrypt from "bcryptjs";
import { db } from "./db";
import { users, registerSchema, loginSchema, passwordResetTokens, forgotPasswordSchema, resetPasswordSchema } from "@shared/schema";
import type { User } from "@shared/schema";
import { eq, and, isNull, gt } from "drizzle-orm";
import crypto from "crypto";
import { sendPasswordResetEmail } from "./email";

declare module "express-session" {
  interface SessionData {
    userId?: number;
  }
}

export function setupSession(app: Express) {
  if (!process.env.SESSION_SECRET && process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET must be set in production");
  }
  const PgStore = connectPgSimple(session);
  app.set("trust proxy", 1);
  const sessionMiddleware = session({
    store: new PgStore({
      conString: process.env.DATABASE_URL,
      tableName: "user_sessions",
      createTableIfMissing: true,
    }),
    secret: process.env.SESSION_SECRET || "dev-only-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    },
  });
  app.set("sessionMiddleware", sessionMiddleware);
  app.use(sessionMiddleware);
}

export async function getUserById(id: number): Promise<User | undefined> {
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return rows[0];
}

export async function getUserByEmail(email: string): Promise<User | undefined> {
  const rows = await db.select().from(users).where(eq(users.email, email.toLowerCase().trim())).limit(1);
  return rows[0];
}

function publicUser(u: User) {
  return {
    id: u.id,
    email: u.email,
    credits: u.credits,
    freeScrapeUsed: u.freeScrapeUsed,
    hasSubscription: false as boolean, // filled in by callers that check Stripe
  };
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Please sign in to continue" });
  }
  next();
}

export function registerAuthRoutes(app: Express) {
  app.post("/api/auth/register", async (req, res) => {
    try {
      const parsed = registerSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "Invalid input" });
      }
      const email = parsed.data.email.toLowerCase().trim();
      const existing = await getUserByEmail(email);
      if (existing) {
        return res.status(409).json({ message: "An account with this email already exists. Try signing in." });
      }
      const passwordHash = await bcrypt.hash(parsed.data.password, 10);
      const [user] = await db.insert(users).values({ email, passwordHash }).returning();
      // Regenerate the session ID on privilege change to prevent session fixation.
      req.session.regenerate((err) => {
        if (err) {
          console.error("Session regenerate error:", err);
          return res.status(500).json({ message: "Failed to create account" });
        }
        req.session.userId = user.id;
        res.json({ user: publicUser(user) });
      });
    } catch (err) {
      console.error("Register error:", err);
      res.status(500).json({ message: "Failed to create account" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "Invalid input" });
      }
      const user = await getUserByEmail(parsed.data.email);
      if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
        return res.status(401).json({ message: "Incorrect email or password" });
      }
      // Regenerate the session ID on privilege change to prevent session fixation.
      req.session.regenerate((err) => {
        if (err) {
          console.error("Session regenerate error:", err);
          return res.status(500).json({ message: "Failed to sign in" });
        }
        req.session.userId = user.id;
        res.json({ user: publicUser(user) });
      });
    } catch (err) {
      console.error("Login error:", err);
      res.status(500).json({ message: "Failed to sign in" });
    }
  });

  app.post("/api/auth/forgot-password", async (req, res) => {
    try {
      const parsed = forgotPasswordSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "Invalid input" });
      }
      // Always respond identically whether or not the account exists, so this
      // endpoint can't be used to probe which emails have accounts.
      const genericResponse = { ok: true, message: "If an account exists for that email, we've sent a reset link." };
      const user = await getUserByEmail(parsed.data.email);
      if (!user) return res.json(genericResponse);

      // Invalidate any previous outstanding tokens for this user.
      await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, user.id));

      const rawToken = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      await db.insert(passwordResetTokens).values({ userId: user.id, tokenHash, expiresAt });

      // Build the link from a trusted origin, never from request headers
      // (host-header poisoning would let an attacker receive valid tokens).
      const trustedDomain = process.env.APP_BASE_URL
        || (process.env.REPLIT_DOMAINS ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}` : null);
      if (!trustedDomain) {
        console.error("No trusted origin available for reset links (APP_BASE_URL / REPLIT_DOMAINS unset)");
        return res.json(genericResponse);
      }
      const resetUrl = `${trustedDomain.replace(/\/$/, "")}/reset-password?token=${rawToken}`;
      try {
        await sendPasswordResetEmail(user.email, resetUrl);
      } catch (err) {
        // Log internally but keep the external response identical to the
        // account-not-found case so failures can't be used for enumeration.
        console.error("Password reset email failed:", err);
      }
      res.json(genericResponse);
    } catch (err) {
      console.error("Forgot password error:", err);
      res.status(500).json({ message: "Something went wrong. Please try again." });
    }
  });

  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const parsed = resetPasswordSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "Invalid input" });
      }
      const tokenHash = crypto.createHash("sha256").update(parsed.data.token).digest("hex");
      // Atomically consume the token: this conditional UPDATE has exactly one
      // winner even under concurrent submissions (no select-then-update race).
      const consumed = await db
        .update(passwordResetTokens)
        .set({ usedAt: new Date() })
        .where(and(
          eq(passwordResetTokens.tokenHash, tokenHash),
          isNull(passwordResetTokens.usedAt),
          gt(passwordResetTokens.expiresAt, new Date()),
        ))
        .returning();
      const record = consumed[0];
      if (!record) {
        return res.status(400).json({ message: "This reset link is invalid or has expired. Please request a new one." });
      }
      const user = await getUserById(record.userId);
      if (!user) {
        return res.status(400).json({ message: "This reset link is invalid or has expired. Please request a new one." });
      }
      const passwordHash = await bcrypt.hash(parsed.data.password, 10);
      await db.update(users).set({ passwordHash }).where(eq(users.id, user.id));

      // Sign the user in right away on their new password.
      req.session.regenerate((err) => {
        if (err) {
          console.error("Session regenerate error:", err);
          return res.json({ ok: true }); // password was reset; they can sign in manually
        }
        req.session.userId = user.id;
        res.json({ ok: true, user: publicUser(user) });
      });
    } catch (err) {
      console.error("Reset password error:", err);
      res.status(500).json({ message: "Something went wrong. Please try again." });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy(() => {
      res.clearCookie("connect.sid");
      res.json({ ok: true });
    });
  });

  app.get("/api/auth/me", async (req, res) => {
    if (!req.session.userId) return res.json({ user: null });
    const user = await getUserById(req.session.userId);
    if (!user) {
      req.session.destroy(() => {});
      return res.json({ user: null });
    }
    res.json({ user: publicUser(user) });
  });
}
