import { useEffect, useState } from "react";

export type WeaverOwner = { id: string; email: string };

export function useAuth() {
  const [owner, setOwner] = useState<WeaverOwner | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const { checkSession } = await import("@/lib/auth.functions");
        const result = await checkSession();
        if (mounted) {
          setOwner(result.ok && result.owner ? result.owner : null);
          setLoading(false);
        }
      } catch {
        if (mounted) {
          setOwner(null);
          setLoading(false);
        }
      }
    }
    void load();
    return () => {
      mounted = false;
    };
  }, []);

  return { user: owner, loading };
}
