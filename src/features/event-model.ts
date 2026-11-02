import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
export type EventRecord = {
  id: string;
  titulo: string;
  descricao: string;
  inicio: string;
  termino: string;
  local: string;
  criado_por: string;
};
export type Vote = { evento_id: string; utilizador_id: string; resposta: "vou" | "nao_vou" };
export function lisbonInstant(date: string, time: string): string {
  const local = `${date}T${time}:00`;
  const instant = fromZonedTime(local, "Europe/Lisbon");
  if (
    Number.isNaN(instant.getTime()) ||
    formatInTimeZone(instant, "Europe/Lisbon", "yyyy-MM-dd'T'HH:mm:ss") !== local
  ) {
    throw new Error("Data ou hora inválida em Portugal. Verifica a mudança de hora.");
  }
  return instant.toISOString();
}
export function eventOrder(events: EventRecord[], now = Date.now()) {
  return [...events].sort((a, b) => {
    const left = Date.parse(a.inicio),
      right = Date.parse(b.inicio);
    const leftFuture = Date.parse(a.termino) >= now,
      rightFuture = Date.parse(b.termino) >= now;
    return leftFuture !== rightFuture
      ? leftFuture
        ? -1
        : 1
      : (leftFuture ? left - right : right - left) || a.id.localeCompare(b.id);
  });
}
