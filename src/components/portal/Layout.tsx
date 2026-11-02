import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { imagePath } from "@/features/content";
import { useAuth } from "@/features/auth";
import { usePage } from "./PageContent";
import { db, message } from "@/lib/supabase";
import { useState } from "react";
export function Layout({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const shared = usePage("site");
  const home = usePage("inicio");
  const [error, setError] = useState("");
  const content = shared.data?.conteudo;
  const footer = content?.secoes[0];
  const label = (id: string, fallback: string) =>
    footer?.itens.find((i) => i.id === id)?.titulo ?? fallback;
  return (
    <div className="portal-shell">
      <header className="portal-header">
        <div className="brand">
          {footer?.imagem && <img src={imagePath(footer.imagem)} alt={content?.titulo ?? ""} />}
          <div>
            <strong>{content?.titulo ?? "USHE"}</strong>
            <small>{content?.subtitulo}</small>
          </div>
        </div>
        <nav aria-label="Menu principal">
          {home.data && <Link to="/">{label("inicio", "Início")}</Link>}
          {home.data?.conteudo.secoes.some((s) => s.id === "hierarquia") && (
            <Link to="/" hash="hierarquia">
              {label("hierarquia", "Hierarquia")}
            </Link>
          )}
          {auth.session && <Link to="/eventos">{label("eventos", "Eventos")}</Link>}
          {auth.isCommand && <Link to="/gestao">{label("gestao", "Gestão")}</Link>}
          {auth.session ? (
            <button
              onClick={async () => {
                setError("");
                try {
                  const { error } = await db().auth.signOut();
                  if (error) throw error;
                } catch (e) {
                  setError(message(e));
                }
              }}
            >
              Sair
            </button>
          ) : (
            <Link to="/entrar">{label("entrar", "Entrar")}</Link>
          )}
        </nav>
      </header>
      {auth.profile && (
        <p className="session-label">
          {auth.profile.nome} · {auth.profile.cargo}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <main className="portal-main">{children}</main>
      <footer className="portal-footer">
        {footer?.imagem && <img src={imagePath(footer.imagem)} alt="" />}
        <strong>{footer?.titulo}</strong>
        <p className="prose-text">{footer?.texto}</p>
      </footer>
    </div>
  );
}
