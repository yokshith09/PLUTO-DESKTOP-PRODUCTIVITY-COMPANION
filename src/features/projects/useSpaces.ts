import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ipc } from "@/ipc";
import { cleanSpaces, EMPTY_SPACES, type Spaces } from "./spaces";

const KEY = ["prefs", "projects.spaces"] as const;

/** Project folders and links, kept in `projects.spaces`. */
export function useSpaces() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: KEY, queryFn: async () => cleanSpaces(await ipc.prefsGet("projects.spaces")) });
  const spaces = data ?? EMPTY_SPACES;
  const save = async (next: Spaces) => {
    qc.setQueryData(KEY, next);
    await ipc.prefsSet("projects.spaces", next);
    // The watcher reads project folders; a new one is watched within a minute.
  };
  return { spaces, save };
}
