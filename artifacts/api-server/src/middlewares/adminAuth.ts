import { Request, Response, NextFunction } from "express";
import { verifyToken } from "./auth";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  // Option 1: x-admin-secret header (external / server-to-server)
  const secret = process.env.ADMIN_SECRET;
  if (secret && req.headers["x-admin-secret"] === secret) {
    next();
    return;
  }

  // Option 2: JWT cookie for a user with isAdmin=true (frontend admin panel)
  const cookieToken = (req as any).cookies?.g_token;
  if (cookieToken) {
    const payload = verifyToken(cookieToken);
    if (payload) {
      const [user] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, payload.userId))
        .limit(1);
      if (user?.isAdmin && !user.isBanned) {
        (req as any).user = user;
        (req as any).userId = user.id;
        next();
        return;
      }
    }
  }

  res.status(403).json({ error: "Forbidden" });
}
