// PostgreSQL real em WASM, isolado: não liga à base de produção.
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const db = new PGlite();
const ids = [
  "10000000-0000-0000-0000-000000000001",
  "10000000-0000-0000-0000-000000000002",
  "10000000-0000-0000-0000-000000000003",
];
const ev = "20000000-0000-0000-0000-000000000001";
let checks = 0;
async function expectDenied(sql) {
  await db.exec("savepoint check_denied");
  let denied = false;
  try {
    await db.exec(sql);
  } catch {
    denied = true;
  }
  await db.exec("rollback to savepoint check_denied; release savepoint check_denied");
  assert(denied, `A operação devia ser recusada: ${sql}`);
  checks++;
}
async function asUser(id, fn, role = "authenticated") {
  await db.exec(
    `begin; set local role ${role}; select set_config('request.jwt.claim.sub','${id ?? ""}',true);`,
  );
  try {
    await fn();
  } finally {
    await db.exec("rollback");
  }
}
async function scalar(sql) {
  return (await db.query(sql)).rows[0].value;
}
try {
  await db.exec(`create role anon nologin; create role authenticated nologin; create schema auth;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;`);
  await db.exec(await readFile(new URL("../supabase/001_schema.sql", import.meta.url), "utf8"));
  await db.exec(
    await readFile(new URL("../supabase/002_conteudo_inicial.sql", import.meta.url), "utf8"),
  );
  await db.exec(`insert into auth.users(id,email,raw_user_meta_data) values
    ('${ids[0]}','comando@example.test','{"nome":"Comando"}'),
    ('${ids[1]}','estagiario@example.test','{"nome":"Estagiário","cargo":"Comando"}'),
    ('${ids[2]}','operacional@example.test','{"nome":"Operacional"}');
    update public.perfis set cargo='Comando' where id='${ids[0]}';`);
  assert.equal(
    await scalar(`select cargo::text as value from public.perfis where id='${ids[1]}'`),
    "Estagiário",
  );
  checks++;
  await asUser(
    null,
    async () => {
      assert.equal(
        await scalar("select count(*)::int as value from public.paginas where chave='gestao'"),
        0,
      );
      checks++;
      assert.equal(
        await scalar("select count(*)::int as value from public.paginas where chave='inicio'"),
        1,
      );
      checks++;
      await expectDenied("select * from public.eventos");
      await expectDenied("select * from public.votos_eventos");
      await expectDenied(
        `insert into public.eventos(titulo,descricao,inicio,termino,local,criado_por) values('X','D','2026-11-02 18:00Z','2026-11-02 19:00Z','Aveiro','${ids[1]}')`,
      );
      await expectDenied(`select public.definir_cargo('${ids[1]}','Comando')`);
    },
    "anon",
  );
  await asUser(ids[1], async () => {
    assert.equal(
      await scalar("select count(*)::int as value from public.paginas where chave='gestao'"),
      0,
    );
    checks++;
    assert.equal(
      await scalar("select count(*)::int as value from public.paginas where chave='eventos'"),
      1,
    );
    checks++;
    await expectDenied(`update public.perfis set cargo='Comando' where id='${ids[1]}'`);
    await expectDenied(`select public.definir_cargo('${ids[1]}','Comando')`);
    await expectDenied(`select public.definir_visibilidade('inicio',false)`);
    await expectDenied(
      `insert into public.permissoes_paginas values('${ids[1]}','inicio',true,true)`,
    );
    assert.equal(
      (
        await db.query(
          "update public.paginas set conteudo=conteudo where chave='inicio' returning chave",
        )
      ).rows.length,
      0,
    );
    checks++;
    await db.exec(
      `insert into public.eventos(id,titulo,descricao,inicio,termino,local) values('${ev}','Treino','Descrição','2026-11-02 18:00Z','2026-11-02 19:00Z','Aveiro')`,
    );
    checks++;
    await db.exec(
      `insert into public.votos_eventos(evento_id,utilizador_id,resposta) values('${ev}','${ids[1]}','vou') on conflict(evento_id,utilizador_id) do update set resposta=excluded.resposta`,
    );
    await db.exec(
      `insert into public.votos_eventos(evento_id,utilizador_id,resposta) values('${ev}','${ids[1]}','nao_vou') on conflict(evento_id,utilizador_id) do update set resposta=excluded.resposta`,
    );
    assert.equal(await scalar("select count(*)::int as value from public.votos_eventos"), 1);
    checks++;
    assert.equal(await scalar("select resposta as value from public.votos_eventos"), "nao_vou");
    checks++;
    await expectDenied(`insert into public.votos_eventos values('${ev}','${ids[1]}','vou')`);
    await expectDenied(`insert into public.votos_eventos values('${ev}','${ids[2]}','vou')`);
    await expectDenied(
      `insert into public.eventos(titulo,descricao,inicio,termino,local,criado_por) values('X','D','2026-11-02 18:00Z','2026-11-02 17:00Z','Aveiro','${ids[1]}')`,
    );
    await expectDenied(
      `insert into public.eventos(titulo,descricao,inicio,termino,local,criado_por) values('X','D','2026-11-02 18:00Z','2026-11-02 19:00Z','Aveiro','${ids[2]}')`,
    );
  });
  // Dados persistentes para testes entre utilizadores (fora de asUser).
  await db.exec(`insert into public.eventos(id,titulo,descricao,inicio,termino,local,criado_por) values('${ev}','Treino','Descrição','2026-11-02 18:00Z','2026-11-02 19:00Z','Aveiro','${ids[1]}');
    insert into public.votos_eventos values('${ev}','${ids[2]}','vou');
    insert into public.permissoes_paginas values('${ids[1]}','inicio',true,true);`);
  await asUser(ids[1], async () => {
    assert.equal(await scalar("select count(*)::int as value from public.votos_eventos"), 1);
    checks++;
    assert.equal(
      (
        await db.query(
          `update public.votos_eventos set resposta='nao_vou' where utilizador_id='${ids[2]}' returning *`,
        )
      ).rows.length,
      0,
    );
    checks++;
    await db.exec(
      "update public.paginas set conteudo=jsonb_set(conteudo,'{titulo}','\"Novo título\"') where chave='inicio'",
    );
    assert.equal(
      await scalar("select revisao as value from public.paginas where chave='inicio'"),
      2,
    );
    checks++;
    assert.equal(
      (
        await db.query(
          "update public.paginas set conteudo=conteudo where chave='inicio' and revisao=1 returning chave",
        )
      ).rows.length,
      0,
    );
    checks++;
    await expectDenied("update public.paginas set publica=true where chave='inicio'");
  });
  await db.exec(
    `update public.permissoes_paginas set pode_editar=false,pode_ver=false where utilizador_id='${ids[1]}'`,
  );
  await asUser(ids[1], async () => {
    assert.equal(
      await scalar("select count(*)::int as value from public.paginas where chave='inicio'"),
      0,
    );
    checks++;
    assert.equal(await scalar("select count(*)::int as value from public.eventos"), 1);
    checks++;
  });
  await asUser(ids[0], async () => {
    assert.equal(
      await scalar("select count(*)::int as value from public.paginas where chave='gestao'"),
      1,
    );
    checks++;
    await expectDenied(`select public.definir_cargo('${ids[0]}','Estagiário')`);
    await db.exec(`select public.definir_cargo('${ids[1]}','Comando')`);
    assert.equal(
      await scalar(`select cargo::text as value from public.perfis where id='${ids[1]}'`),
      "Comando",
    );
    checks++;
    await db.exec("select public.definir_visibilidade('inicio',false)");
    assert.equal(
      await scalar("select publica as value from public.paginas where chave='inicio'"),
      false,
    );
    checks++;
  });
  console.log(`RLS: ${checks} verificações aprovadas em PostgreSQL/PGlite.`);
} finally {
  await db.close();
}
