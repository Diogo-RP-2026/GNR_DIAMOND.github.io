# Validação da entrega

- `npm run typecheck`: aprovado.
- `npm test`: 11 testes aprovados em 4 ficheiros.
- `npm run test:rls`: 32 verificações aprovadas em PostgreSQL/PGlite, com utilizadores e dados fictícios.
- `npm run build`: aprovado, mantendo o build TanStack Start original.
- `npm run build:pages`: aprovado, com HTML por rota.
- Build estático com `PAGES_BASE_PATH=/teste-ushe/`: verificado para os recursos em subpasta.

Os testes cobrem rotas, ordenação e conversão das datas dos eventos, leitura de mais de 1000 registos, edição e ordem de secções, conflitos entre editores, montagem da aplicação estática, unicidade dos votos, troca de resposta, autoria dos eventos, bloqueio de votos alheios, isolamento da Gestão, elevação indevida de cargos, permissões individuais e proteção do último Comando.

Não foi possível validar a interface visual na infraestrutura de preview, que recusou o host antes de carregar a aplicação. Não foram fornecidas as credenciais públicas de um projeto Supabase nem o esquema de uma base existente; por isso, nenhuma migração foi executada numa base real do utilizador. Os passos de teste manual estão no README.
