import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ContentEditor } from "@/components/portal/ContentEditor";
import { contentSchema, savePage, type Page } from "@/features/content";
vi.mock("@/features/content", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/content")>()),
  savePage: vi.fn(),
}));
const page: Page = {
  chave: "inicio",
  publica: true,
  revisao: 1,
  conteudo: {
    titulo: "Original",
    subtitulo: "Subtítulo",
    secoes: [
      {
        id: "a",
        tipo: "texto",
        etiqueta: "",
        titulo: "Primeira",
        texto: "A",
        imagem: "",
        itens: [],
      },
      {
        id: "b",
        tipo: "texto",
        etiqueta: "",
        titulo: "Segunda",
        texto: "B",
        imagem: "",
        itens: [],
      },
    ],
  },
};
beforeEach(() => {
  cleanup();
  vi.mocked(savePage).mockReset();
});
function setup() {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  const wrap = (value: Page) => (
    <QueryClientProvider client={client}>
      <ContentEditor page={value} />
    </QueryClientProvider>
  );
  return { ...render(wrap(page)), wrap };
}
describe("Editor CMS", () => {
  it("guarda o conteúdo completo e a ordem alterada", async () => {
    vi.mocked(savePage).mockResolvedValue({ ...page, revisao: 2 });
    setup();
    fireEvent.change(screen.getByRole("textbox", { name: "Título" }), {
      target: { value: "Novo título" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "↓ Descer" })[0]!);
    fireEvent.click(screen.getByRole("button", { name: "Guardar conteúdo" }));
    await screen.findByText("Conteúdo guardado.");
    const [base, content] = vi.mocked(savePage).mock.calls[0]!;
    expect(base.revisao).toBe(1);
    expect(content.titulo).toBe("Novo título");
    expect(content.secoes.map((s) => s.id)).toEqual(["b", "a"]);
  });
  it("mantém o texto não guardado e a revisão original quando chega uma alteração remota", async () => {
    vi.mocked(savePage).mockRejectedValue(new Error("O conteúdo mudou."));
    const { rerender, wrap } = setup();
    fireEvent.change(screen.getByRole("textbox", { name: "Título" }), {
      target: { value: "O meu rascunho" },
    });
    rerender(
      wrap({
        ...page,
        revisao: 2,
        conteudo: { ...page.conteudo, titulo: "Alteração de outra pessoa" },
      }),
    );
    expect(screen.getByRole("textbox", { name: "Título" })).toHaveValue(
      "O meu rascunho",
    );
    fireEvent.click(screen.getByRole("button", { name: "Guardar conteúdo" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("O conteúdo mudou."));
    expect(vi.mocked(savePage).mock.calls[0]![0].revisao).toBe(1);
    expect(screen.queryByText("Conteúdo guardado.")).toBeNull();
  });
  it("recusa imagens executáveis e preserva texto simples", () => {
    const invalid = {
      ...page.conteudo,
      secoes: [{ ...page.conteudo.secoes[0]!, imagem: "javascript:alert(1)" }],
    };
    expect(contentSchema.safeParse(invalid).success).toBe(false);
  });
});
