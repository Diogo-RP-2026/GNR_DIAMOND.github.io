import { createContext, useContext, useEffect, useState, useRef, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { db, supabase } from "@/lib/supabase";
import type { Profile } from "./content";

type Auth = {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  error: string;
  isCommand: boolean;
};
const Context = createContext<Auth>({
  session: null,
  profile: null,
  loading: true,
  error: "",
  isCommand: false,
});
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const client = useQueryClient();
  const previousId = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!supabase) {
      setReady(true);
      return;
    }
    // Listener síncrono: nunca aguardar chamadas à API dentro do callback de Auth.
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      if (previousId.current !== next?.user.id) client.clear();
      previousId.current = next?.user.id;
      setSession(next);
      setReady(true);
    });
    let active = true;
    void supabase.auth
      .getSession()
      .then(({ error: authError }) => {
        if (active && authError) {
          setError(authError.message);
          setReady(true);
        }
      })
      .catch((e: Error) => {
        if (active) {
          setError(e.message);
          setReady(true);
        }
      });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [client]);
  const profile = useQuery({
    queryKey: ["profile", session?.user.id],
    enabled: !!session,
    refetchInterval: 15000,
    queryFn: async () => {
      const { data, error } = await db()
        .from("perfis")
        .select("*")
        .eq("id", session!.user.id)
        .single();
      if (error) throw error;
      return data as Profile;
    },
  });
  const value: Auth = {
    session,
    profile: profile.data ?? null,
    loading: !ready || (!!session && profile.isPending),
    error: error || profile.error?.message || "",
    isCommand: profile.data?.cargo === "Comando",
  };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export const useAuth = () => useContext(Context);
