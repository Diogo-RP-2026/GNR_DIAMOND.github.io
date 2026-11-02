import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { contentSchema, savePage, type Content, type Page } from "@/features/content";
import { message } from "@/lib/supabase";

export function ContentEditor({ page }: { page: Page }) {
  const [base, setBase] = useState(page);
  const [draft, setDraft] = useState<Content>(() => structuredClone(page.conteudo));
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => savePage(base, draft),
    onSuccess: async (updated) => {
      setBase(updated);
      setSaved(true);
      await client.invalidateQueries({ queryKey: ["page"] });
    },
    onError: (e) => setError(message(e)),
  });
  function change(patch: Partial<Content>) {
    setDraft((old) => ({ ...old, ...patch }));
    setSaved(false);
  }
  function updateSection(index: number, patch: Partial<Content["secoes"][number]>) {
    setSaved(false);
    setDraft((old) => ({
      ...old,
      secoes: old.secoes.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    }));
  }
  function move(index: number, direction: number) {
    const sections = [...draft.secoes];
    const target = index + direction;
    if (target < 0 || target >= sections.length) return;
    [sections[index], sections[target]] = [sections[target]!, sections[index]!];
    change({ secoes: sections });
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSaved(false);
    const parsed = contentSchema.safeParse(draft);
    if (!parsed.success) {
      setError(parsed.error.issues.map((i) => i.message).join("; "));
      return;
    }
    mutation.mutate();
  }
  const shared = draft.secoes[0];
  return (
    <form className="cms-editor" onSubmit={submit}>
      <fieldset disabled={mutation.isPending}>
        <h2>Editar: {page.chave}</h2>
        {base.revisao < page.revisao && (
          <p className="notice">
            Esta página mudou desde que abriste o editor. Copia o teu texto e recarrega antes de
            guardar.
          </p>
        )}
        <p>
          Texto simples; as imagens usam um endereço HTTPS ou /images/. As alterações ficam visíveis
          depois de guardar.
        </p>
        <label>
          Título
          <input
            required
            maxLength={200}
            value={draft.titulo}
            onChange={(e) => change({ titulo: e.target.value })}
          />
        </label>
        <label>
          Subtítulo
          <textarea
            maxLength={10000}
            value={draft.subtitulo}
            onChange={(e) => change({ subtitulo: e.target.value })}
          />
        </label>
        {page.chave === "site" ? (
          shared && (
            <fieldset>
              <legend>Identidade e navegação</legend>
              <label>
                Emblema / imagem (URL)
                <input
                  value={shared.imagem}
                  maxLength={2000}
                  onChange={(e) => updateSection(0, { imagem: e.target.value })}
                />
              </label>
              <label>
                Título do rodapé
                <input
                  value={shared.titulo}
                  maxLength={200}
                  onChange={(e) => updateSection(0, { titulo: e.target.value })}
                />
              </label>
              <label>
                Texto do rodapé
                <textarea
                  value={shared.texto}
                  maxLength={10000}
                  onChange={(e) => updateSection(0, { texto: e.target.value })}
                />
              </label>
              {shared.itens.map((item) => (
                <label key={item.id}>
                  Nome no menu: {item.id}
                  <input
                    value={item.titulo}
                    maxLength={200}
                    onChange={(e) =>
                      updateSection(0, {
                        itens: shared.itens.map((it) =>
                          it.id === item.id ? { ...it, titulo: e.target.value } : it,
                        ),
                      })
                    }
                  />
                </label>
              ))}
            </fieldset>
          )
        ) : (
          <>
            {draft.secoes.map((s, index) => (
              <fieldset key={s.id}>
                <legend>Secção {index + 1}</legend>
                <div className="actions">
                  <button type="button" disabled={index === 0} onClick={() => move(index, -1)}>
                    ↑ Subir
                  </button>
                  <button
                    type="button"
                    disabled={index === draft.secoes.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    ↓ Descer
                  </button>
                  <button
                    type="button"
                    onClick={() => change({ secoes: draft.secoes.filter((_, i) => i !== index) })}
                  >
                    Remover secção
                  </button>
                </div>
                <label>
                  Formato
                  <select
                    value={s.tipo}
                    onChange={(e) =>
                      updateSection(index, { tipo: e.target.value as typeof s.tipo })
                    }
                  >
                    <option value="destaque">Destaque</option>
                    <option value="texto">Texto</option>
                    <option value="hierarquia">Lista / hierarquia</option>
                  </select>
                </label>
                <label>
                  Etiqueta
                  <input
                    maxLength={200}
                    value={s.etiqueta}
                    onChange={(e) => updateSection(index, { etiqueta: e.target.value })}
                  />
                </label>
                <label>
                  Título da secção
                  <input
                    maxLength={200}
                    value={s.titulo}
                    onChange={(e) => updateSection(index, { titulo: e.target.value })}
                  />
                </label>
                <label>
                  Texto
                  <textarea
                    maxLength={10000}
                    value={s.texto}
                    onChange={(e) => updateSection(index, { texto: e.target.value })}
                  />
                </label>
                <label>
                  Imagem (URL)
                  <input
                    maxLength={2000}
                    value={s.imagem}
                    onChange={(e) => updateSection(index, { imagem: e.target.value })}
                  />
                </label>
                {s.itens.map((item, j) => (
                  <div className="editor-item" key={item.id}>
                    <label>
                      Título do item {j + 1}
                      <input
                        value={item.titulo}
                        maxLength={200}
                        onChange={(e) =>
                          updateSection(index, {
                            itens: s.itens.map((it, k) =>
                              k === j ? { ...it, titulo: e.target.value } : it,
                            ),
                          })
                        }
                      />
                    </label>
                    <label>
                      Descrição
                      <textarea
                        value={item.texto}
                        maxLength={10000}
                        onChange={(e) =>
                          updateSection(index, {
                            itens: s.itens.map((it, k) =>
                              k === j ? { ...it, texto: e.target.value } : it,
                            ),
                          })
                        }
                      />
                    </label>
                    <div className="actions">
                      <button
                        type="button"
                        disabled={!j}
                        onClick={() => {
                          const items = [...s.itens];
                          [items[j - 1], items[j]] = [items[j]!, items[j - 1]!];
                          updateSection(index, { itens: items });
                        }}
                      >
                        ↑ Subir item
                      </button>
                      <button
                        type="button"
                        disabled={j === s.itens.length - 1}
                        onClick={() => {
                          const items = [...s.itens];
                          [items[j + 1], items[j]] = [items[j]!, items[j + 1]!];
                          updateSection(index, { itens: items });
                        }}
                      >
                        ↓ Descer item
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          updateSection(index, { itens: s.itens.filter((_, k) => k !== j) })
                        }
                      >
                        Remover item
                      </button>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    updateSection(index, {
                      itens: [
                        ...s.itens,
                        { id: crypto.randomUUID(), titulo: "Novo item", texto: "" },
                      ],
                    })
                  }
                >
                  Adicionar item
                </button>
              </fieldset>
            ))}
            <button
              type="button"
              onClick={() =>
                change({
                  secoes: [
                    ...draft.secoes,
                    {
                      id: crypto.randomUUID(),
                      tipo: "texto",
                      etiqueta: "",
                      titulo: "Nova secção",
                      texto: "",
                      imagem: "",
                      itens: [],
                    },
                  ],
                })
              }
            >
              Adicionar secção
            </button>
          </>
        )}
        <div className="actions">
          <button disabled={mutation.isPending} type="submit">
            {mutation.isPending ? "A guardar…" : "Guardar conteúdo"}
          </button>
        </div>
      </fieldset>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {saved && <p role="status">Conteúdo guardado.</p>}
    </form>
  );
}
