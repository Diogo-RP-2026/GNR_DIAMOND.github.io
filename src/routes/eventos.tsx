import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatInTimeZone } from "date-fns-tz";
import { PageContent } from "@/components/portal/PageContent";
import { useAuth } from "@/features/auth";
import type { Profile } from "@/features/content";
import { eventOrder, lisbonInstant, type EventRecord, type Vote } from "@/features/event-model";
import { allRows, db, message } from "@/lib/supabase";
export const Route = createFileRoute("/eventos")({ component: EventsPage });
function EventsPage() {
  return (
    <PageContent pageKey="eventos">
      <Events />
    </PageContent>
  );
}
function Events() {
  const { session } = useAuth();
  const client = useQueryClient();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const query = useQuery({
    queryKey: ["events", session!.user.id],
    refetchInterval: 15000,
    queryFn: async () => {
      const [events, votes, profiles] = await Promise.all([
        allRows<EventRecord>((from, to) =>
          db().from("eventos").select("*").order("id").range(from, to),
        ),
        allRows<Vote>((from, to) =>
          db()
            .from("votos_eventos")
            .select("*")
            .order("evento_id")
            .order("utilizador_id")
            .range(from, to),
        ),
        allRows<Profile>((from, to) => db().from("perfis").select("*").order("id").range(from, to)),
      ]);
      return { events, votes, profiles };
    },
  });
  const create = useMutation({
    mutationFn: async (form: HTMLFormElement) => {
      const values = new FormData(form);
      const get = (key: string) => String(values.get(key) ?? "").trim();
      const inicio = lisbonInstant(get("data"), get("inicio"));
      const termino = lisbonInstant(get("data"), get("termino"));
      if (Date.parse(termino) <= Date.parse(inicio))
        throw new Error("A hora de término tem de ser posterior à hora de início.");
      const { error } = await db()
        .from("eventos")
        .insert({
          titulo: get("titulo"),
          descricao: get("descricao"),
          local: get("local"),
          inicio,
          termino,
          criado_por: session!.user.id,
        });
      if (error) throw error;
      form.reset();
    },
    onSuccess: async () => {
      setSuccess("Evento criado.");
      await client.invalidateQueries({ queryKey: ["events"] });
    },
    onError: (e) => setError(message(e)),
  });
  const vote = useMutation({
    mutationFn: async ({ eventId, response }: { eventId: string; response: Vote["resposta"] }) => {
      const { error } = await db()
        .from("votos_eventos")
        .upsert(
          { evento_id: eventId, utilizador_id: session!.user.id, resposta: response },
          { onConflict: "evento_id,utilizador_id" },
        );
      if (error) throw error;
    },
    onSuccess: async () => {
      setSuccess("Resposta guardada.");
      await client.invalidateQueries({ queryKey: ["events"] });
    },
    onError: (e) => setError(message(e)),
  });
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setSuccess("");
    create.mutate(e.currentTarget);
  }
  const names = new Map(query.data?.profiles.map((p) => [p.id, p.nome]));
  return (
    <div className="events-area">
      <details className="panel">
        <summary>Criar evento</summary>
        <form onSubmit={submit}>
          <label>
            Título
            <input name="titulo" required maxLength={160} />
          </label>
          <label>
            Descrição
            <textarea name="descricao" required maxLength={10000} />
          </label>
          <div className="form-grid">
            <label>
              Data
              <input name="data" type="date" required />
            </label>
            <label>
              Hora de início
              <input name="inicio" type="time" required />
            </label>
            <label>
              Hora de término
              <input name="termino" type="time" required />
            </label>
          </div>
          <p>Horas de Portugal continental (Europe/Lisbon). Início e término no mesmo dia.</p>
          <label>
            Local
            <input name="local" required maxLength={300} />
          </label>
          <button disabled={create.isPending}>
            {create.isPending ? "A criar…" : "Criar evento"}
          </button>
        </form>
      </details>
      <div className="actions">
        <button disabled={query.isFetching} onClick={() => void query.refetch()}>
          Atualizar lista
        </button>
        <small>Atualização automática a cada 15 segundos.</small>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {success && <p role="status">{success}</p>}
      {query.isPending && <p role="status">A carregar eventos…</p>}
      {query.error && (
        <p className="error" role="alert">
          {message(query.error)}
        </p>
      )}
      {query.data && !query.data.events.length && <p>Ainda não há eventos. Cria o primeiro.</p>}
      {eventOrder(query.data?.events ?? []).map((event) => {
        const votes = query.data!.votes.filter((v) => v.evento_id === event.id);
        const mine = votes.find((v) => v.utilizador_id === session!.user.id)?.resposta;
        return (
          <article key={event.id} className="panel event-card">
            <h2>{event.titulo}</h2>
            <p className="eyebrow">
              {Date.parse(event.termino) < Date.now() ? "Terminado" : "Próximo / em curso"}
            </p>
            <p>
              {formatInTimeZone(event.inicio, "Europe/Lisbon", "dd/MM/yyyy HH:mm")} –{" "}
              {formatInTimeZone(event.termino, "Europe/Lisbon", "HH:mm")} · {event.local}
            </p>
            <p className="prose-text">{event.descricao}</p>
            <small>Criado por {names.get(event.criado_por) ?? "Utilizador"}</small>
            <div className="response-grid">
              {(["vou", "nao_vou"] as const).map((response) => {
                const group = votes.filter((v) => v.resposta === response);
                return (
                  <div key={response}>
                    <button
                      aria-pressed={mine === response}
                      disabled={vote.isPending}
                      onClick={() => {
                        setError("");
                        setSuccess("");
                        vote.mutate({ eventId: event.id, response });
                      }}
                    >
                      {response === "vou" ? "Vou" : "Não vou"} ({group.length})
                    </button>
                    <ul aria-label={response === "vou" ? "Quem vai" : "Quem não vai"}>
                      {group.map((v) => (
                        <li key={v.utilizador_id}>{names.get(v.utilizador_id) ?? "Utilizador"}</li>
                      ))}
                    </ul>
                    {!group.length && <p>Sem respostas.</p>}
                  </div>
                );
              })}
            </div>
          </article>
        );
      })}
    </div>
  );
}
