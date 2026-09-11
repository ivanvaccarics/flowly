import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client.js";
import { describeError } from "./use-workspace.js";

export interface Collection<T> {
  items: T[];
  error: string | undefined;
  loading: boolean;
  reload: () => Promise<void>;
  create: (entity: unknown) => Promise<boolean>;
  update: (entity: T & { id: string }) => Promise<boolean>;
  remove: (id: string, revision: number, cascade?: boolean) => Promise<boolean>;
  clearError: () => void;
}

export function useCollection<T extends { id: string; revision: number }>(
  kind: string,
  csrf: string | undefined,
  enabled: boolean,
): Collection<T> {
  const [items, setItems] = useState<T[]>([]);
  const [error, setError] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!enabled || !csrf) return;
    setLoading(true);
    try {
      const response = await api.list<T>(kind);
      setItems(response.items);
      setError(undefined);
    } catch (cause) {
      setError(describeError(cause));
    } finally {
      setLoading(false);
    }
  }, [csrf, enabled, kind]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const mutate = useCallback(
    async (action: () => Promise<unknown>): Promise<boolean> => {
      try {
        await action();
        await reload();
        setError(undefined);
        return true;
      } catch (cause) {
        setError(describeError(cause));
        return false;
      }
    },
    [reload],
  );

  return {
    items,
    error,
    loading,
    reload,
    create: useCallback(
      (entity: unknown) =>
        csrf ? mutate(() => api.create(csrf, kind, entity)) : Promise.resolve(false),
      [csrf, kind, mutate],
    ),
    update: useCallback(
      (entity: T & { id: string }) =>
        csrf ? mutate(() => api.update(csrf, kind, entity.id, entity)) : Promise.resolve(false),
      [csrf, kind, mutate],
    ),
    remove: useCallback(
      (id: string, revision: number, cascade = false) =>
        csrf
          ? mutate(() =>
              cascade
                ? api.cascadeRemove(csrf, kind, id, revision)
                : api.remove(csrf, kind, id, revision),
            )
          : Promise.resolve(false),
      [csrf, kind, mutate],
    ),
    clearError: useCallback(() => setError(undefined), []),
  };
}
