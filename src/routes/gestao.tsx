import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageContent, usePage } from "@/components/portal/PageContent";
import { ContentEditor } from "@/components/portal/ContentEditor";
import { pageKeys, roles, type PageKey, type Profile } from "@/features/content";
import { allRows, db, message } from "@/lib/supabase";
export const Route = createFileRoute("/gestao")({ component: ManagementPage });
function ManagementPage() {
  return (
    <PageContent pageKey="gestao">
      <Management />
    </PageContent>
  );
}
type Permission = {
  utilizador_id: string;
  pagina: string;
  pode_ver: boolean;
  pode_editar: boolean;
};
function Management() {
  const [selected, setSelected] = useState<PageKey>("inicio");
  const page = usePage(selected);
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const people = useQuery({
    queryKey: ["management"],
    refetchInterval: 15000,
    queryFn: async () => {
      const [profiles, permissions] = await Promise.all([
        allRows<Profile>((from, to) => db().from("perfis").select("*").order("id").range(from, to)),
        allRows<Permission>((from, to) =>
          db()
            .from("permissoes_paginas")
            .select("*")
            .order("utilizador_id")
            .order("pagina")
            .range(from, to),
        ),
      ]);
      return { profiles, permissions };
    },
  });
  async function run(action: () => PromiseLike<{ error: { message: string } | null }>) {
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const { error } = await action();
      if (error) throw error;
      await Promise.all([
        client.invalidateQueries({ queryKey: ["management"] }),
        client.invalidateQueries({ queryKey: ["profile"] }),
        client.invalidateQueries({ queryKey: ["page"] }),
        client.invalidateQueries({ queryKey: ["access"] }),
      ]);
      setStatus("Alteração guardada.");
    } catch (error) {
      setError(message(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="management-area">
      <section className="panel">
        <h2>Conteúdo das páginas</h2>
        <label>
          Página
          <select value={selected} onChange={(e) => setSelected(e.target.value as PageKey)}>
            {pageKeys.map((key) => (
              <option key={key} value={key}>
                {key === "site" ? "Identidade, rodapé e nomes do menu" : key}
              </option>
            ))}
          </select>
        </label>
        {page.isPending && <p>A carregar…</p>}
        {page.error && (
          <p role="alert" className="error">
            {message(page.error)}
          </p>
        )}
        {page.data && <ContentEditor key={selected} page={page.data} />}
      </section>
      <section className="panel">
        <h2>Visibilidade e permissões</h2>
        <p>
          A Gestão é exclusiva do Comando. Eventos permite criar e votar a qualquer conta com sessão
          iniciada. No Início, as permissões individuais sobrepõem-se à visibilidade geral. Em
          Eventos e Entrar podes delegar a edição dos textos da página; a leitura e a votação mantêm
          as regras fixas.
        </p>
        {selected === "inicio" && page.data && (
          <label>
            <input
              type="checkbox"
              disabled={busy}
              checked={page.data.publica}
              onChange={(e) =>
                void run(() =>
                  db().rpc("definir_visibilidade", {
                    p_chave: "inicio",
                    p_publica: e.target.checked,
                  }),
                )
              }
            />{" "}
            Início visível por defeito para todos, incluindo visitantes
          </label>
        )}
        {selected !== "inicio" && (
          <p>Seleciona «inicio» para alterar a visibilidade geral da página inicial.</p>
        )}
        {people.isPending && <p>A carregar utilizadores…</p>}
        {people.error && (
          <p className="error" role="alert">
            {message(people.error)}
          </p>
        )}
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Utilizador</th>
                <th>Cargo</th>
                <th>Início</th>
                <th>Eventos (conteúdo)</th>
                <th>Entrar (conteúdo)</th>
              </tr>
            </thead>
            <tbody>
              {people.data?.profiles.map((person) => {
                return (
                  <tr key={person.id}>
                    <td>
                      {person.nome}
                      <small className="user-id">{person.id}</small>
                    </td>
                    <td>
                      <select
                        aria-label={`Cargo de ${person.nome}`}
                        value={person.cargo}
                        disabled={busy}
                        onChange={(e) =>
                          void run(() =>
                            db().rpc("definir_cargo", { p_id: person.id, p_cargo: e.target.value }),
                          )
                        }
                      >
                        {roles.map((role) => (
                          <option key={role}>{role}</option>
                        ))}
                      </select>
                    </td>
                    {(["inicio", "eventos", "entrar"] as const).map((pageKey) => {
                      const permission = people.data.permissions.find(
                        (p) => p.utilizador_id === person.id && p.pagina === pageKey,
                      );
                      const value = !permission
                        ? "padrao"
                        : permission.pode_editar
                          ? "editar"
                          : permission.pode_ver
                            ? "ver"
                            : "nenhum";
                      return (
                        <td key={pageKey}>
                          {person.cargo === "Comando" ? (
                            <span>Acesso total</span>
                          ) : (
                            <select
                              aria-label={`Permissão de ${person.nome} em ${pageKey}`}
                              value={value}
                              disabled={busy}
                              onChange={(e) => {
                                const mode = e.target.value;
                                void run(() =>
                                  mode === "padrao"
                                    ? db()
                                        .from("permissoes_paginas")
                                        .delete()
                                        .eq("utilizador_id", person.id)
                                        .eq("pagina", pageKey)
                                    : db()
                                        .from("permissoes_paginas")
                                        .upsert(
                                          {
                                            utilizador_id: person.id,
                                            pagina: pageKey,
                                            pode_ver: mode !== "nenhum",
                                            pode_editar: mode === "editar",
                                          },
                                          { onConflict: "utilizador_id,pagina" },
                                        ),
                                );
                              }}
                            >
                              <option value="padrao">Predefinido</option>
                              {pageKey === "inicio" && <option value="nenhum">Sem acesso</option>}
                              <option value="ver">Ver</option>
                              <option value="editar">Ver e editar</option>
                            </select>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {status && <p role="status">{status}</p>}
    </div>
  );
}
