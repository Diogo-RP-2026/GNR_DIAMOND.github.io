import { z } from "zod";
import { db } from "@/lib/supabase";
export const pageKeys = ["inicio", "eventos", "gestao", "entrar", "site"] as const;
export type PageKey = (typeof pageKeys)[number];
export const roles = [
  "Comando",
  "Primeiro Oficial",
  "Oficial",
  "Sargento",
  "Operacional",
  "Estagiário",
  "Quadro Permanentes",
] as const;
export type Profile = { id: string; nome: string; cargo: (typeof roles)[number] };
export const safeImage = (value: string) =>
  value === "" || /^https:\/\/[^\s]+$/i.test(value) || /^\/images\/[\w./-]+$/.test(value);
const itemSchema = z.object({
  id: z.string(),
  titulo: z.string().max(200),
  texto: z.string().max(10000),
});
export const contentSchema = z.object({
  titulo: z.string().min(1).max(200),
  subtitulo: z.string().max(10000),
  secoes: z
    .array(
      z.object({
        id: z.string(),
        tipo: z.enum(["destaque", "texto", "hierarquia"]),
        etiqueta: z.string().max(200),
        titulo: z.string().max(200),
        texto: z.string().max(10000),
        imagem: z
          .string()
          .max(2000)
          .refine(safeImage, "Usa uma imagem HTTPS ou um caminho /images/."),
        itens: z.array(itemSchema).max(100),
      }),
    )
    .max(100),
});
export type Content = z.infer<typeof contentSchema>;
export type Page = { chave: PageKey; publica: boolean; conteudo: Content; revisao: number };
export async function readPage(key: PageKey): Promise<Page | null> {
  const { data, error } = await db()
    .from("paginas")
    .select("chave,publica,conteudo,revisao")
    .eq("chave", key)
    .maybeSingle();
  if (error) throw error;
  return data ? ({ ...data, conteudo: contentSchema.parse(data.conteudo) } as Page) : null;
}
export async function savePage(page: Page, content: Content) {
  const { data, error } = await db()
    .from("paginas")
    .update({ conteudo: contentSchema.parse(content) })
    .eq("chave", page.chave)
    .eq("revisao", page.revisao)
    .select("chave,publica,conteudo,revisao");
  if (error) throw error;
  if (!data?.length)
    throw new Error(
      "O conteúdo mudou ou perdeste acesso. Guarda uma cópia do texto e recarrega a página antes de tentar novamente.",
    );
  return { ...data[0]!, conteudo: contentSchema.parse(data[0]!.conteudo) } as Page;
}

export function imagePath(value: string) {
  return value.startsWith("/images/") ? `${import.meta.env.BASE_URL}${value.slice(1)}` : value;
}
