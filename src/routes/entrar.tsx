import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { PageContent } from "@/components/portal/PageContent";
import { useAuth } from "@/features/auth";
import { db, message } from "@/lib/supabase";
export const Route = createFileRoute("/entrar")({ component: LoginPage });
function LoginPage() {
  return (
    <PageContent pageKey="entrar">
      <Login />
    </PageContent>
  );
}
function Login() {
  const { session } = useAuth();
  const [register, setRegister] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setStatus("");
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email")).trim();
    const password = String(form.get("password"));
    try {
      if (register) {
        const { data, error } = await db().auth.signUp({
          email,
          password,
          options: { data: { nome: String(form.get("nome")).trim() } },
        });
        if (error) throw error;
        setStatus(
          data.session
            ? "Conta criada e sessão iniciada."
            : "Consulta o teu email para confirmares a conta. Depois volta a iniciar sessão.",
        );
      } else {
        const { error } = await db().auth.signInWithPassword({ email, password });
        if (error) throw error;
        setStatus("Sessão iniciada.");
      }
    } catch (error) {
      setError(message(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="panel login-panel">
      {session ? (
        <p role="status">Tens sessão iniciada. Usa o menu para navegar.</p>
      ) : (
        <>
          <div className="actions">
            <button type="button" aria-pressed={!register} onClick={() => setRegister(false)}>
              Entrar
            </button>
            <button type="button" aria-pressed={register} onClick={() => setRegister(true)}>
              Criar conta
            </button>
          </div>
          <form onSubmit={submit}>
            {register && (
              <label>
                Nome visível
                <input name="nome" required maxLength={100} autoComplete="name" />
              </label>
            )}
            <label>
              Email
              <input name="email" type="email" required autoComplete="email" />
            </label>
            <label>
              Palavra-passe
              <input
                name="password"
                type="password"
                required
                minLength={8}
                maxLength={128}
                autoComplete={register ? "new-password" : "current-password"}
              />
            </label>
            <button disabled={busy}>
              {busy ? "A aguardar…" : register ? "Criar conta" : "Entrar"}
            </button>
          </form>
        </>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {status && <p role="status">{status}</p>}
    </div>
  );
}
