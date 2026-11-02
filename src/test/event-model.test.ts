import { describe, expect, it } from "vitest";
import { eventOrder, lisbonInstant, type EventRecord } from "@/features/event-model";
import { allRows } from "@/lib/supabase";
const event = (id: string, inicio: string, termino: string): EventRecord => ({
  id,
  inicio,
  termino,
  titulo: id,
  descricao: "",
  local: "",
  criado_por: "x",
});
describe("Eventos", () => {
  it("ordena os próximos por data, os passados por mais recente e mantém os eventos em curso primeiro", () => {
    const records = [
      event("old", "2026-01-01Z", "2026-01-02Z"),
      event("later", "2026-12-01Z", "2026-12-02Z"),
      event("current", "2026-11-01Z", "2026-11-03Z"),
      event("soon", "2026-11-04Z", "2026-11-05Z"),
    ];
    expect(eventOrder(records, Date.parse("2026-11-02Z")).map((e) => e.id)).toEqual([
      "current",
      "soon",
      "later",
      "old",
    ]);
  });
  it("converte horas de Lisboa no verão e no inverno sem depender do fuso do browser", () => {
    expect(lisbonInstant("2026-07-01", "18:00")).toBe("2026-07-01T17:00:00.000Z");
    expect(lisbonInstant("2026-12-01", "18:00")).toBe("2026-12-01T18:00:00.000Z");
    expect(() => lisbonInstant("2026-03-29", "01:30")).toThrow();
  });
  it("lê mais de mil votos e suporta limites da API inferiores à dimensão pedida", async () => {
    const votes = Array.from({ length: 1205 }, (_, i) => i);
    const data = await allRows<number>(async (from) => ({
      data: votes.slice(from, from + 100),
      error: null,
    }));
    expect(data).toEqual(votes);
  });
});
