import { createClient } from "@supabase/supabase-js";

const url = import.meta.env["VITE_SUPABASE_URL"];
const key = import.meta.env["VITE_SUPABASE_ANON_KEY"];
// Nunca colocar uma chave service_role no browser ou em variáveis VITE_*.
export const supabase =
  url && key
    ? createClient(url, key, {
        auth: {
          persistSession: typeof window !== "undefined",
          autoRefreshToken: typeof window !== "undefined",
          detectSessionInUrl: typeof window !== "undefined",
        },
      })
    : null;
export function db() {
  if (!supabase)
    throw new Error("Configura VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY e reinicia o site.");
  return supabase;
}
export function message(error: unknown): string {
  return error instanceof Error
    ? error.message
    : error && typeof error === "object" && "message" in error
      ? String(error.message)
      : "Ocorreu um erro. Tenta novamente.";
}
// Percorre todas as páginas da API: o limite de resposta não é um limite de participantes.
export async function allRows<T>(
  fetchPage: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await fetchPage(offset, offset + 499);
    if (error) throw new Error(error.message);
    if (!data?.length) return rows;
    rows.push(...data);
    offset += data.length; // também funciona quando o servidor impõe um máximo inferior a 500.
  }
}
