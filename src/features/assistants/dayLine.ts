import { ymd } from "@/lib/dates";

type ChatEvent = { assistant: string; folder: string; kind: string; atMs: number };

/** A calm, local-only summary of today's assistant chat events (A-5). */
export function dayLine(events: ChatEvent[], today: string): string | null {
  const todays = events.filter((event) => ymd(new Date(event.atMs)) === today);
  const done = todays.filter((event) => event.kind === "done");
  const permissions = todays.filter((event) => event.kind === "permission");
  if (done.length === 0 && permissions.length === 0) return null;

  if (done.length === 0) return `Today with assistants: ${permissions.length} asked for permission.`;

  let text = `Today with assistants: ${done.length} ${done.length === 1 ? "chat" : "chats"} finished`;
  if (permissions.length > 0) text += `, ${permissions.length} asked for permission`;
  text += ".";

  const folders = new Map<string, number>();
  for (const event of done) folders.set(event.folder, (folders.get(event.folder) ?? 0) + 1);
  const ranked = [...folders.entries()].sort((a, b) => b[1] - a[1]);
  if (ranked[0] && ranked[0][1] > (ranked[1]?.[1] ?? 0)) text += ` Most in ${ranked[0][0]}.`;
  return text;
}
