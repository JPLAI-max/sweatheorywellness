import { db, ipEventsTable } from "@workspace/db";

type IpEventName = "signup" | "login" | "post_create" | "stream_start" | "upload";

export function logIpEvent(userId: number, ip: string | null | undefined, eventName: IpEventName): void {
  if (!ip) return;
  void db.insert(ipEventsTable).values({ userId, ipAddress: ip, eventName }).catch(() => {});
}
