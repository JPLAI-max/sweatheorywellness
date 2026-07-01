import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const JWT_SECRET = process.env.SESSION_SECRET ?? "dev-secret-change-in-prod";

export function signToken(userId: number): string {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: "30d" });
}

export function verifyToken(token: string): { userId: number } | null {
  try {
    return jwt.verify(token, JWT_SECRET) as { userId: number };
  } catch {
    return null;
  }
}

function extractToken(req: Request): string | null {
  const cookieToken = (req as any).cookies?.g_token;
  if (cookieToken) return cookieToken;
  // Fallback: Authorization Bearer header (used in dev/preview when cookies
  // are blocked by the browser inside cross-site iframes, e.g. Replit canvas)
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) return authHeader.slice(7);
  return null;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = extractToken(req);

  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: "Invalid token" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, payload.userId)).limit(1);
  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }

  if (user.isBanned) {
    res.status(403).json({ error: "Account suspended" });
    return;
  }

  if (user.isSuspended && user.suspendedUntil && user.suspendedUntil > new Date()) {
    res.status(403).json({ error: "Account temporarily suspended", suspendedUntil: user.suspendedUntil });
    return;
  }

  (req as any).user = user;
  (req as any).userId = user.id;
  next();
}

export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const token = extractToken(req);

  if (token) {
    const payload = verifyToken(token);
    if (payload) {
      const [user] = await db.select().from(usersTable).where(eq(usersTable.id, payload.userId)).limit(1);
      if (user && !user.isBanned) {
        if (!(user.isSuspended && user.suspendedUntil && user.suspendedUntil > new Date())) {
          (req as any).user = user;
          (req as any).userId = user.id;
        }
      }
    }
  }

  next();
}
