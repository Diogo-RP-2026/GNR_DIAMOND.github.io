import { useEffect, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/features/auth";
import { readPage, imagePath, type Content, type PageKey } from "@/features/content";
import { db, supabase } from "@/lib/supabase";
import { ContentEditor } from "./ContentEditor";

export function usePage(key: PageKey) {
  const { session, loading } = useAuth();
  return useQuery({
    queryKey: ["page", key, session?.user.id ?? "anon"],
    queryFn: () => readPage(key),
    enabled: !loading && !!supabase,
    refetchInterval: 15000,
  });
}
export function ContentSections({ content }: { content: Content }) {
  return (
    <>
      {content.secoes.map((section) => (
        <section
          key={section.id}
          id={section.id}
          className={`content-section section-${section.tipo}`}
        >
          {section.imagem && (
            <img src={imagePath(section.imagem)} alt={section.titulo || "Imagem da secção"} />
          )}
          {section.etiqueta && <p className="eyebrow">{section.etiqueta}</p>}
          <h2>{section.titulo}</h2>
          <p className="prose-text">{section.texto}</p>
          {section.itens.length > 0 && (
            <ol className={section.tipo === "hierarquia" ? "rank-list" : "content-list"}>
              {section.itens.map((item, i) => (
                <li key={item.id}>
                  <span className="rank-number">{i + 1}</span>
                  <div>
                    <h3>{item.titulo}</h3>
                    <p className="prose-text">{item.texto}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      ))}
    </>
  );
}
export function PageContent({ pageKey, children }: { pageKey: PageKey; children?: ReactNode }) {
  const auth = useAuth();
  const query = usePage(pageKey);
  const [editing, setEditing] = useState(false);
  const access = useQuery({
    queryKey: ["access", pageKey, auth.session?.user.id],
    enabled: !!auth.session,
    refetchInterval: 15000,
    queryFn: async () => {
      const { data, error } = await db().rpc("acesso_pagina", { p_chave: pageKey });
      if (error) throw error;
      return data as { ver: boolean; editar: boolean };
    },
  });
  useEffect(() => {
    if (query.data) document.title = `${query.data.conteudo.titulo} · USHE`;
  }, [query.data]);
  if (!supabase)
    return (
      <p className="notice">
        Falta configurar o Supabase. Consulta o README e o ficheiro .env.example.
      </p>
    );
  if (auth.loading) return <p role="status">A carregar sessão…</p>;
  if (auth.error)
    return (
      <p className="error" role="alert">
        {auth.error}
      </p>
    );
  if ((pageKey === "eventos" || pageKey === "gestao") && !auth.session)
    return (
      <p className="notice">
        Inicia sessão para continuar. <Link to="/entrar">Entrar</Link>
      </p>
    );
  if (pageKey === "gestao" && !auth.isCommand)
    return <p className="notice">Acesso reservado ao Comando.</p>;
  if (query.isPending) return <p role="status">A carregar conteúdo…</p>;
  if (query.error)
    return (
      <p className="error" role="alert">
        {query.error.message} <button onClick={() => void query.refetch()}>Tentar novamente</button>
      </p>
    );
  if (!query.data)
    return (
      <p className="notice">Sem acesso a esta página, ou o conteúdo ainda não foi instalado.</p>
    );
  const page = query.data;
  return (
    <>
      <div className="page-heading">
        <h1>{page.conteudo.titulo}</h1>
        <p className="prose-text">{page.conteudo.subtitulo}</p>
      </div>
      <ContentSections content={page.conteudo} />
      {children}
      {access.data?.editar && pageKey !== "gestao" && (
        <details
          open={editing}
          onToggle={(e) => setEditing(e.currentTarget.open)}
          className="inline-editor"
        >
          <summary>Editar conteúdo desta página</summary>
          {editing && <ContentEditor key={page.chave} page={page} />}
        </details>
      )}
    </>
  );
}
