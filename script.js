/* Portal USHE. JavaScript normal, sem compilação e sem serviços externos. */
(() => {
  "use strict";

  const PAGE_KEYS = ["inicio", "eventos", "gestao", "entrar", "site"];
  const PAGE_LABELS = { inicio: "Início", eventos: "Eventos", gestao: "Gestão", entrar: "Entrar", site: "Identidade, rodapé e nomes do menu" };
  const ROLES = ["Comando", "Primeiro Oficial", "Oficial", "Sargento", "Operacional", "Estagiário", "Quadro Permanentes"];
  const DELEGATED_PAGES = ["inicio", "eventos", "entrar"];
  const $ = (selector, root = document) => root.querySelector(selector);
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const id = () => globalThis.crypto?.randomUUID?.() ?? `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
  const nameKey = (value) => value.trim().normalize("NFKC").toLocaleLowerCase("pt-PT");
  const EMPTY = () => ({ versao: 1, revisao: 0, paginas: {}, perfis: [], eventos: [], votos: [], permissoes: [] });

  function check(test, message) {
    if (!test) throw new Error(message);
  }

  function text(value, max, label, required = false) {
    check(typeof value === "string" && value.length <= max && (!required || value.trim().length > 0), `${label}: valor inválido (máximo ${max} caracteres).`);
    return value;
  }

  function identifier(value) {
    check(typeof value === "string" && /^[a-z0-9_-]{1,160}$/i.test(value), "Identificador inválido.");
    return value;
  }

  function safeImage(value) {
    if (value === "") return "";
    text(value, 2000, "Imagem");
    if (value.startsWith("https://")) {
      const url = new URL(value);
      check(url.protocol === "https:" && !url.username && !url.password, "Endereço de imagem inválido.");
      return value;
    }
    const path = value.replace(/^(?:\.\/|\/)/, "");
    check(/^images\/[a-z0-9_./-]+$/i.test(path) && !path.split("/").some((part) => part === ".." || part === "." || !part), "Usa images/nome.png ou um endereço HTTPS para a imagem.");
    return path;
  }

  function validateContent(raw, pageKey) {
    check(object(raw) && Array.isArray(raw.secoes) && raw.secoes.length <= 100, "Conteúdo inválido: são permitidas até 100 secções por página.");
    const sectionIds = new Set();
    const content = {
      titulo: text(raw.titulo, 200, "Título", true),
      subtitulo: text(raw.subtitulo, 10000, "Subtítulo"),
      secoes: raw.secoes.map((section) => {
        check(object(section), "Secção inválida.");
        const sectionId = identifier(section.id);
        check(!sectionIds.has(sectionId), "Há identificadores de secções repetidos.");
        sectionIds.add(sectionId);
        check(["destaque", "texto", "hierarquia"].includes(section.tipo), "Formato de secção inválido.");
        check(Array.isArray(section.itens) && section.itens.length <= 100, "São permitidos até 100 itens por secção.");
        const itemIds = new Set();
        return {
          id: sectionId,
          tipo: section.tipo,
          etiqueta: text(section.etiqueta, 200, "Etiqueta"),
          titulo: text(section.titulo, 200, "Título da secção"),
          texto: text(section.texto, 10000, "Texto"),
          imagem: safeImage(section.imagem),
          itens: section.itens.map((item) => {
            check(object(item), "Item inválido.");
            const itemId = identifier(item.id);
            check(!itemIds.has(itemId), "Há identificadores de itens repetidos.");
            itemIds.add(itemId);
            return { id: itemId, titulo: text(item.titulo, 200, "Título do item"), texto: text(item.texto, 10000, "Descrição do item") };
          }),
        };
      }),
    };
    if (pageKey === "site") {
      check(content.secoes.length === 1, "A identidade do site precisa de uma secção.");
      for (const key of ["inicio", "hierarquia", "eventos", "gestao", "entrar"]) {
        check(content.secoes[0].itens.some((item) => item.id === key && item.titulo.trim()), `Falta o nome do menu: ${key}.`);
      }
    }
    return content;
  }

  function validatePage(raw, key) {
    check(object(raw) && raw.chave === key && typeof raw.publica === "boolean" && Number.isSafeInteger(raw.revisao) && raw.revisao >= 1, "Página inválida.");
    return { chave: key, publica: key === "inicio" ? raw.publica : ["site", "entrar"].includes(key), conteudo: validateContent(raw.conteudo, key), revisao: raw.revisao };
  }

  function instant(value) {
    check(typeof value === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value, "Data guardada inválida.");
    return value;
  }

  function validateEvent(raw) {
    check(object(raw), "Evento inválido.");
    const event = {
      id: identifier(raw.id), titulo: text(raw.titulo, 160, "Título do evento", true),
      descricao: text(raw.descricao, 10000, "Descrição", true), local: text(raw.local, 300, "Local", true),
      inicio: instant(raw.inicio), termino: instant(raw.termino), criado_por: identifier(raw.criado_por),
    };
    check(Date.parse(event.termino) > Date.parse(event.inicio), "A hora de término tem de ser posterior à hora de início.");
    check(lisbonParts(new Date(event.inicio)).slice(0, 10) === lisbonParts(new Date(event.termino)).slice(0, 10), "O início e o término têm de ser no mesmo dia em Portugal continental.");
    return event;
  }

  function validateState(raw) {
    check(object(raw) && raw.versao === 1 && Number.isSafeInteger(raw.revisao) && raw.revisao >= 0, "Formato dos dados locais incompatível.");
    check(object(raw.paginas), "Páginas locais inválidas.");
    for (const key of ["perfis", "eventos", "votos", "permissoes"]) check(Array.isArray(raw[key]), `Lista inválida: ${key}.`);
    const result = EMPTY();
    result.revisao = raw.revisao;
    for (const [key, page] of Object.entries(raw.paginas)) {
      check(PAGE_KEYS.includes(key), "Página desconhecida nos dados locais.");
      result.paginas[key] = validatePage(page, key);
    }
    const profiles = new Set(), names = new Set(), events = new Set(), votes = new Set(), permissions = new Set();
    result.perfis = raw.perfis.map((profile) => {
      check(object(profile), "Perfil inválido.");
      const profileId = identifier(profile.id);
      const name = text(profile.nome, 100, "Nome", true).trim();
      check(name.length >= 2 && !profiles.has(profileId) && !names.has(nameKey(name)) && ROLES.includes(profile.cargo), "Perfil repetido ou cargo inválido.");
      profiles.add(profileId); names.add(nameKey(name));
      return { id: profileId, nome: name, cargo: profile.cargo };
    });
    check(!result.perfis.length || result.perfis.some((p) => p.cargo === "Comando"), "Tem de existir pelo menos um perfil Comando.");
    result.eventos = raw.eventos.map((rawEvent) => {
      const event = validateEvent(rawEvent);
      check(!events.has(event.id) && profiles.has(event.criado_por), "Evento repetido ou autor inexistente.");
      events.add(event.id);
      return event;
    });
    result.votos = raw.votos.map((vote) => {
      check(object(vote) && events.has(vote.evento_id) && profiles.has(vote.utilizador_id) && ["vou", "nao_vou"].includes(vote.resposta), "Resposta inválida.");
      const key = `${vote.evento_id}:${vote.utilizador_id}`;
      check(!votes.has(key), "Há mais de uma resposta do mesmo perfil ao mesmo evento.");
      votes.add(key);
      return { evento_id: vote.evento_id, utilizador_id: vote.utilizador_id, resposta: vote.resposta };
    });
    result.permissoes = raw.permissoes.map((permission) => {
      check(object(permission) && profiles.has(permission.utilizador_id) && DELEGATED_PAGES.includes(permission.pagina) && typeof permission.pode_ver === "boolean" && typeof permission.pode_editar === "boolean" && (!permission.pode_editar || permission.pode_ver), "Permissão local inválida.");
      const key = `${permission.utilizador_id}:${permission.pagina}`;
      check(!permissions.has(key), "Permissão local repetida.");
      permissions.add(key);
      return { utilizador_id: permission.utilizador_id, pagina: permission.pagina, pode_ver: permission.pode_ver, pode_editar: permission.pode_editar };
    });
    return result;
  }

  const lisbonFormatter = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Lisbon", calendar: "gregory", numberingSystem: "latn", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  function lisbonParts(date) {
    const p = Object.fromEntries(lisbonFormatter.formatToParts(date).map((part) => [part.type, part.value]));
    return `${p.year.padStart(4, "0")}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
  }

  // Obtém os desvios reais do fuso. Não depende do fuso configurado no computador.
  function lisbonInstant(date, time) {
    check(/^\d{4}-\d\d-\d\d$/.test(date) && /^\d\d:\d\d$/.test(time) && Number(date.slice(0, 4)) >= 1000, "Data ou hora inválida.");
    const local = `${date}T${time}:00`;
    const target = Date.parse(`${local}.000Z`);
    check(Number.isFinite(target) && new Date(target).toISOString().slice(0, 19) === local, "Data ou hora inválida.");
    const offsets = new Set([-2, 0, 2].map((days) => {
      const sample = target + days * 86400000;
      const parts = lisbonParts(new Date(sample)).split(/\D/).map(Number);
      return Date.UTC(parts[0], parts[1] - 1, parts[2], parts[3], parts[4], parts[5]) - sample;
    }));
    const matches = [...offsets].map((offset) => target - offset).filter((candidate) => Number.isFinite(candidate) && lisbonParts(new Date(candidate)) === local).sort((a, b) => a - b);
    check(matches.length > 0, "Esta hora não existe em Portugal continental devido à mudança de hora. Escolhe outra hora.");
    // Na hora repetida do outono, usa a primeira ocorrência.
    return new Date(matches[0]).toISOString();
  }

  function eventOrder(events, now = Date.now()) {
    return [...events].sort((a, b) => {
      const aFuture = Date.parse(a.termino) >= now, bFuture = Date.parse(b.termino) >= now;
      return aFuture !== bFuture ? (aFuture ? -1 : 1) : (aFuture ? Date.parse(a.inicio) - Date.parse(b.inicio) : Date.parse(b.inicio) - Date.parse(a.inicio)) || a.id.localeCompare(b.id);
    });
  }

  function canView(key, data, person, pages) {
    if (key === "site" || key === "entrar") return true;
    if (key === "gestao") return person?.cargo === "Comando";
    if (key === "eventos") return Boolean(person);
    if (person?.cargo === "Comando") return true;
    const permission = data.permissoes.find((p) => p.utilizador_id === person?.id && p.pagina === key);
    return permission ? permission.pode_ver : (data.paginas[key] ?? pages[key]).publica;
  }

  function canEdit(key, data, person) {
    if (!person) return false;
    if (person.cargo === "Comando") return true;
    return DELEGATED_PAGES.includes(key) && data.permissoes.some((p) => p.utilizador_id === person.id && p.pagina === key && p.pode_editar);
  }

  // Tudo o que segue executa apenas no navegador.
  const BASE_URL = new URL(".", document.currentScript.src);
  const STORAGE_KEY = `ushe-pages:v1:${BASE_URL.pathname}`;
  const SESSION_KEY = `${STORAGE_KEY}:perfil`;
  const ui = { selectedPage: "inicio", eventFilter: "todos", navigationApproved: false };
  let defaults, state, sessionId = "", storageProblem = "", damagedData = "";

  function page(key, data = state) { return data.paginas[key] ?? defaults[key]; }
  function profile(data = state) { return data.perfis.find((person) => person.id === sessionId) ?? null; }
  function actor(data) {
    const person = profile(data);
    check(person, "Escolhe um perfil local para continuar.");
    return person;
  }
  function command(data) {
    const person = actor(data);
    check(person.cargo === "Comando", "Esta opção está disponível para perfis Comando.");
    return person;
  }

  function loadState(strict = false) {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const result = raw === null ? EMPTY() : validateState(JSON.parse(raw));
      storageProblem = "";
      damagedData = "";
      return result;
    } catch (error) {
      storageProblem = "Não foi possível ler os dados locais. O conteúdo publicado continua disponível. Podes descarregar os dados para recuperação ou repor este navegador.";
      try { damagedData = localStorage.getItem(STORAGE_KEY) ?? ""; } catch { /* Armazenamento bloqueado. */ }
      if (strict) throw new Error("Os dados locais estão indisponíveis. Resolve o aviso de armazenamento antes de guardar.");
      return EMPTY();
    }
  }

  function transaction(change) {
    const draft = loadState(true);
    change(draft);
    draft.revisao += 1;
    const next = validateState(draft);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); }
    catch { throw new Error("Não foi possível guardar. O armazenamento pode estar cheio ou bloqueado. Os dados anteriores foram preservados; exporta uma cópia antes de limpar o navegador."); }
    state = next;
    return next;
  }

  function setSession(value) {
    try {
      if (value) sessionStorage.setItem(SESSION_KEY, value);
      else sessionStorage.removeItem(SESSION_KEY);
    } catch { /* A escolha continua a funcionar durante esta visita. */ }
    sessionId = value;
  }

  function flash(message, error = false) {
    const node = $("#feedback");
    node.hidden = false;
    node.className = `feedback${error ? " error" : ""}`;
    node.setAttribute("role", error ? "alert" : "status");
    node.textContent = message;
  }

  function guard(action) {
    try { action(); } catch (error) { flash(error.message || "Não foi possível concluir a operação.", true); }
  }

  function image(value, alt, className = "") {
    if (!value) return "";
    const path = safeImage(value);
    return `<img src="${escape(new URL(path, BASE_URL).href)}" alt="${escape(alt)}"${className ? ` class="${className}"` : ""} loading="lazy">`;
  }

  function currentRoute() {
    const url = new URL(location.hash.slice(1) || "/", "https://ushe.invalid");
    const key = ({ "/": "inicio", "/eventos": "eventos", "/gestao": "gestao", "/entrar": "entrar" })[url.pathname.replace(/\/$/, "") || "/"];
    return { key: key ?? "404", section: url.searchParams.get("secao") };
  }

  function routeHref(key) { return key === "inicio" ? "#/" : `#/${key}`; }

  function renderHeader() {
    const content = page("site").conteudo, shared = content.secoes[0], person = profile(), route = currentRoute();
    const label = (key, fallback) => shared.itens.find((item) => item.id === key)?.titulo || fallback;
    const nav = (key, title) => `<a href="${routeHref(key)}"${route.key === key && !route.section ? ' aria-current="page"' : ""}>${escape(title)}</a>`;
    $("#site-header").innerHTML = `
      <a class="brand" href="#/">${image(shared.imagem, "Emblema da unidade")}<div><strong>${escape(content.titulo)}</strong><small>${escape(content.subtitulo)}</small></div></a>
      <nav aria-label="Menu principal">
        ${canView("inicio", state, person, defaults) ? nav("inicio", label("inicio", "Início")) : ""}
        ${canView("inicio", state, person, defaults) && page("inicio").conteudo.secoes.some((section) => section.id === "hierarquia") ? `<a href="#/?secao=hierarquia"${route.section === "hierarquia" ? ' aria-current="location"' : ""}>${escape(label("hierarquia", "Hierarquia"))}</a>` : ""}
        ${nav("eventos", label("eventos", "Eventos"))}
        ${person?.cargo === "Comando" ? nav("gestao", label("gestao", "Gestão")) : ""}
        ${person ? `<a class="profile-link" href="#/entrar">${escape(person.nome)} <span>· ${escape(person.cargo)}</span></a><button type="button" data-action="logout">Sair</button>` : nav("entrar", label("entrar", "Entrar"))}
      </nav>`;
    $("#site-footer").innerHTML = `${image(shared.imagem, "")}<strong>${escape(shared.titulo)}</strong><p class="prose-text">${escape(shared.texto)}</p><small>Portal estático · Dados locais neste navegador</small>`;
    const notice = $("#storage-notice");
    notice.hidden = !storageProblem;
    notice.innerHTML = storageProblem ? `<p>${escape(storageProblem)}</p><div class="actions">${damagedData ? '<button type="button" data-action="export-damaged">Descarregar dados para recuperação</button>' : ""}<button type="button" data-action="reset-storage">Repor dados locais</button></div>` : "";
  }

  function contentSections(content) {
    return content.secoes.map((section) => `<section id="sec-${escape(section.id)}" class="content-section section-${section.tipo}">
      ${image(section.imagem, section.titulo || "Imagem da secção")}
      ${section.etiqueta ? `<p class="eyebrow">${escape(section.etiqueta)}</p>` : ""}
      ${section.titulo ? `<h2>${escape(section.titulo)}</h2>` : ""}
      ${section.texto ? `<p class="prose-text">${escape(section.texto)}</p>` : ""}
      ${section.itens.length ? `<ol class="${section.tipo === "hierarquia" ? "rank-list" : "content-list"}">${section.itens.map((item, index) => `<li><span class="rank-number">${String(index + 1).padStart(2, "0")}</span><div><h3>${escape(item.titulo)}</h3>${item.texto ? `<p class="prose-text">${escape(item.texto)}</p>` : ""}</div></li>`).join("")}</ol>` : ""}
    </section>`).join("");
  }

  function loginMarkup() {
    const person = profile();
    return `<div class="login-panel panel">
      <h2>${person ? "Perfil ativo" : "Entrar neste navegador"}</h2>
      <p class="muted">Um perfil serve para identificar as tuas respostas neste navegador. Qualquer pessoa com acesso a este navegador pode selecionar estes perfis.</p>
      ${person ? `<p class="active-profile">${escape(person.nome)} <span class="badge">${escape(person.cargo)}</span></p><div class="actions"><a class="button primary" href="#/eventos">Ver eventos</a><button type="button" data-action="logout">Sair do perfil</button></div>` : ""}
      ${state.perfis.length ? `<form id="select-profile-form"><label>Perfil local<select name="perfil" required>${state.perfis.map((p) => `<option value="${escape(p.id)}"${person?.id === p.id ? " selected" : ""}>${escape(p.nome)} · ${escape(p.cargo)}</option>`).join("")}</select></label><button type="submit">${person ? "Mudar de perfil" : "Usar perfil"}</button></form>` : '<p class="notice">Ainda não existem perfis neste navegador.</p>'}
      <details${state.perfis.length ? "" : " open"}><summary>Criar perfil local</summary><form id="create-profile-form"><label>Nome visível<input name="nome" required minlength="2" maxlength="100" autocomplete="off" placeholder="O teu nome"></label><p class="muted">${state.perfis.length ? "Os novos perfis começam como Estagiário. O Comando pode alterar o cargo na Gestão local." : "O primeiro perfil deste navegador recebe o cargo Comando para configurar o portal local."}</p><button type="submit">Criar e usar perfil</button></form></details>
    </div>`;
  }

  function eventsMarkup() {
    return `<div class="events-area">
      <details class="panel create-event"><summary>Criar evento</summary>
        <form id="create-event-form">
          <label>Título<input name="titulo" required maxlength="160"></label>
          <label>Descrição<textarea name="descricao" required maxlength="10000"></textarea></label>
          <div class="form-grid"><label>Data<input name="data" type="date" required min="1000-01-01" max="9999-12-31"></label><label>Hora de início<input name="inicio" type="time" required></label><label>Hora de término<input name="termino" type="time" required></label></div>
          <p class="muted">Horas de Portugal continental. Início e término no mesmo dia. Na hora repetida de outono, é usada a primeira ocorrência.</p>
          <label>Local<input name="local" required maxlength="300"></label><button class="primary" type="submit">Criar evento neste navegador</button>
        </form>
      </details>
      <div class="events-toolbar"><div><h2>Agenda da unidade</h2><p class="muted">Próximos eventos primeiro. Cada perfil tem uma resposta por evento e pode alterá-la.</p></div><label>Mostrar<select id="event-filter"><option value="todos">Todos os eventos</option><option value="proximos">Próximos / em curso</option><option value="terminados">Terminados</option></select></label></div>
      <div id="events-list"></div>
    </div>`;
  }

  function renderEventsList() {
    const root = $("#events-list");
    if (!root) return;
    const person = profile(), now = Date.now();
    const ordered = eventOrder(state.eventos, now).filter((event) => ui.eventFilter === "todos" || (ui.eventFilter === "proximos" ? Date.parse(event.termino) >= now : Date.parse(event.termino) < now));
    const names = new Map(state.perfis.map((p) => [p.id, p.nome]));
    const formatter = new Intl.DateTimeFormat("pt-PT", { timeZone: "Europe/Lisbon", dateStyle: "long", timeStyle: "short" });
    const time = new Intl.DateTimeFormat("pt-PT", { timeZone: "Europe/Lisbon", hour: "2-digit", minute: "2-digit" });
    root.innerHTML = ordered.length ? ordered.map((event) => {
      const votes = state.votos.filter((vote) => vote.evento_id === event.id);
      const mine = votes.find((vote) => vote.utilizador_id === person?.id)?.resposta;
      return `<article class="panel event-card" data-event-id="${escape(event.id)}"><div class="event-heading"><span class="badge">${Date.parse(event.termino) < now ? "Terminado" : "Próximo / em curso"}</span><h2>${escape(event.titulo)}</h2></div>
        <p class="event-date"><time datetime="${escape(event.inicio)}">${escape(formatter.format(new Date(event.inicio)))}</time> — ${escape(time.format(new Date(event.termino)))} · ${escape(event.local)}</p>
        <p class="prose-text">${escape(event.descricao)}</p><small class="muted">Criado por ${escape(names.get(event.criado_por) ?? "Perfil local")}</small>
        <div class="response-grid">${["vou", "nao_vou"].map((response) => {
          const group = votes.filter((vote) => vote.resposta === response);
          const label = response === "vou" ? "Vou" : "Não vou";
          return `<div><button type="button" data-action="vote" data-event="${escape(event.id)}" data-response="${response}" aria-pressed="${mine === response}">${label} (${group.length})</button>${group.length ? `<ul aria-label="${response === "vou" ? "Quem vai" : "Quem não vai"}">${group.map((vote) => `<li>${escape(names.get(vote.utilizador_id) ?? "Perfil local")}</li>`).join("")}</ul>` : '<p class="muted">Sem respostas.</p>'}</div>`;
        }).join("")}</div></article>`;
    }).join("") : '<div class="empty-state panel"><h3>Sem eventos para mostrar</h3><p>Cria um evento ou escolhe outro filtro.</p></div>';
  }

  function permissionsMarkup() {
    return `<section class="panel"><h2>Cargos e permissões locais</h2><p class="muted">Estas opções organizam a interface neste navegador. Não autenticam pessoas nem tornam privados os ficheiros publicados. Todos os perfis podem criar eventos e votar, independentemente do cargo.</p>
      <label class="checkbox-row"><input type="checkbox" id="home-public"${page("inicio").publica ? " checked" : ""}> Mostrar o Início a visitantes neste navegador</label>
      <div class="table-scroll"><table><caption>Perfis guardados neste navegador</caption><thead><tr><th scope="col">Perfil</th><th scope="col">Cargo</th><th scope="col">Início</th><th scope="col">Eventos (textos)</th><th scope="col">Entrar (textos)</th></tr></thead><tbody>${state.perfis.map((person) => `<tr><th scope="row">${escape(person.nome)}${person.id === sessionId ? '<small class="user-id">Perfil ativo</small>' : ""}</th><td><select data-role-for="${escape(person.id)}" aria-label="Cargo de ${escape(person.nome)}">${ROLES.map((role) => `<option${role === person.cargo ? " selected" : ""}>${escape(role)}</option>`).join("")}</select></td>${DELEGATED_PAGES.map((key) => {
        if (person.cargo === "Comando") return "<td>Acesso total</td>";
        const permission = state.permissoes.find((p) => p.utilizador_id === person.id && p.pagina === key);
        const selected = !permission ? "padrao" : permission.pode_editar ? "editar" : permission.pode_ver ? "ver" : "nenhum";
        const options = [["padrao", "Predefinido"], ...(key === "inicio" ? [["nenhum", "Ocultar nesta interface"]] : []), ["ver", "Ver"], ["editar", "Ver e editar"]];
        return `<td><select data-permission-for="${escape(person.id)}" data-page="${key}" aria-label="Permissão de ${escape(person.nome)} em ${key}">${options.map(([value, label]) => `<option value="${value}"${selected === value ? " selected" : ""}>${label}</option>`).join("")}</select></td>`;
      }).join("")}</tr>`).join("")}</tbody></table></div></section>`;
  }

  function managementMarkup() {
    return `<div class="management-area"><section class="panel"><h2>Conteúdo das páginas</h2><p class="muted">Edita os textos, imagens e a ordem das secções. Guardar aplica as alterações neste navegador.</p><label>Página<select id="page-selector">${PAGE_KEYS.map((key) => `<option value="${key}"${key === ui.selectedPage ? " selected" : ""}>${PAGE_LABELS[key]}</option>`).join("")}</select></label><div id="management-editor"></div></section>
      ${permissionsMarkup()}
      <section class="panel"><h2>Publicar os textos para todos</h2><p>Descarrega <code>conteudo.js</code> e substitui esse ficheiro no repositório do GitHub. Depois da publicação, o novo conteúdo fica disponível aos visitantes. Perfis, eventos, votos e permissões locais não são incluídos.</p><div class="actions"><button type="button" data-action="export-content">Descarregar conteudo.js</button><button type="button" data-action="published-content">Usar os textos publicados neste navegador</button></div><p class="muted">Um navegador com edições locais mantém essas edições até escolher «Usar os textos publicados». Os textos do ficheiro publicado são públicos, mesmo que a interface os oculte.</p></section>
      <section class="panel"><h2>Cópia dos dados locais</h2><p>Exporta perfis, eventos, respostas, permissões e edições para um ficheiro JSON. A importação substitui todos os dados locais deste portal; não junta respostas nem sincroniza navegadores.</p><div class="actions"><button type="button" data-action="export-backup">Descarregar cópia JSON</button><label class="file-picker">Importar cópia JSON<input id="import-backup" type="file" accept=".json,application/json"></label></div><details><summary>Repor este navegador</summary><p>Descarrega primeiro uma cópia se quiseres conservar os dados.</p><button type="button" class="danger" data-action="reset-storage">Apagar dados locais deste portal</button></details></section></div>`;
  }

  function renderMain(focus = false) {
    const root = $("#conteudo-principal"), route = currentRoute(), person = profile();
    if (route.key === "404") {
      document.title = "Página não encontrada · USHE";
      root.innerHTML = '<div class="empty-state panel"><h1>Página não encontrada</h1><p>Usa o menu para navegar no portal.</p><a class="button" href="#/">Voltar ao Início</a></div>';
    } else if (!canView(route.key, state, person, defaults)) {
      document.title = "Acesso local · USHE";
      root.innerHTML = `<div class="empty-state panel"><h1>${route.key === "gestao" ? "Gestão local" : "Escolhe um perfil"}</h1><p>${route.key === "gestao" && person ? "A Gestão é apresentada aos perfis com o cargo Comando neste navegador." : "Escolhe um perfil local para continuar. Os perfis ficam neste navegador."}</p><a class="button primary" href="#/entrar">Escolher perfil</a></div>`;
    } else {
      const content = page(route.key).conteudo;
      document.title = `${content.titulo} · USHE`;
      root.innerHTML = `<div class="page-heading"><p class="eyebrow">Unidade de Segurança e Honra do Estado</p><h1>${escape(content.titulo)}</h1><p class="prose-text">${escape(content.subtitulo)}</p></div>${contentSections(content)}${route.key === "entrar" ? loginMarkup() : route.key === "eventos" ? eventsMarkup() : route.key === "gestao" ? managementMarkup() : ""}${canEdit(route.key, state, person) && route.key !== "gestao" ? '<details class="inline-editor" id="inline-editor"><summary>Editar conteúdo desta página</summary><div id="inline-editor-form"></div></details>' : ""}`;
      if (route.key === "eventos") { $("#event-filter").value = ui.eventFilter; renderEventsList(); }
      if (route.key === "gestao") mountEditor($("#management-editor"), ui.selectedPage);
      const inline = $("#inline-editor");
      if (inline) inline.addEventListener("toggle", () => { if (inline.open && !$("form", inline)) mountEditor($("#inline-editor-form"), route.key); });
      if (route.section) document.getElementById(`sec-${route.section}`)?.scrollIntoView({ block: "start" });
    }
    if (focus && !route.section) root.focus({ preventScroll: true });
  }

  function render(focus = false) { renderHeader(); renderMain(focus); }

  function field(label, value, property, options = {}) {
    const attrs = `data-property="${property}"${options.section !== undefined ? ` data-section="${options.section}"` : ""}${options.item !== undefined ? ` data-item="${options.item}"` : ""}`;
    return `<label>${escape(label)}${options.multiline ? `<textarea ${attrs} maxlength="10000">${escape(value)}</textarea>` : `<input ${attrs} value="${escape(value)}" maxlength="${options.image ? 2000 : 200}"${options.required ? " required" : ""}>`}</label>`;
  }

  function editorMarkup(draft, key) {
    const action = (label, type, section, item, disabled = false) => `<button type="button" data-editor-action="${type}"${section !== undefined ? ` data-section="${section}"` : ""}${item !== undefined ? ` data-item="${item}"` : ""}${disabled ? " disabled" : ""}>${label}</button>`;
    let sections;
    if (key === "site") {
      const shared = draft.secoes[0];
      sections = `<fieldset><legend>Identidade, emblema e rodapé</legend>${field("Emblema / imagem", shared.imagem, "imagem", { section: 0, image: true })}${field("Título do rodapé", shared.titulo, "titulo", { section: 0 })}${field("Texto do rodapé", shared.texto, "texto", { section: 0, multiline: true })}${shared.itens.map((item, index) => field(`Nome no menu: ${item.id}`, item.titulo, "titulo", { section: 0, item: index, required: true })).join("")}</fieldset>`;
    } else {
      sections = draft.secoes.map((section, index) => `<fieldset><legend>Secção ${index + 1}</legend><div class="actions">${action("↑ Subir", "section-up", index, undefined, index === 0)}${action("↓ Descer", "section-down", index, undefined, index === draft.secoes.length - 1)}${action("Remover secção", "section-remove", index)}</div><label>Formato<select data-property="tipo" data-section="${index}">${[["destaque", "Destaque"], ["texto", "Texto"], ["hierarquia", "Lista / hierarquia"]].map(([value, label]) => `<option value="${value}"${value === section.tipo ? " selected" : ""}>${label}</option>`).join("")}</select></label>${field("Etiqueta", section.etiqueta, "etiqueta", { section: index })}${field("Título da secção", section.titulo, "titulo", { section: index })}${field("Texto", section.texto, "texto", { section: index, multiline: true })}${field("Imagem", section.imagem, "imagem", { section: index, image: true })}${section.itens.map((item, itemIndex) => `<div class="editor-item">${field(`Título do item ${itemIndex + 1}`, item.titulo, "titulo", { section: index, item: itemIndex })}${field("Descrição", item.texto, "texto", { section: index, item: itemIndex, multiline: true })}<div class="actions">${action("↑ Subir item", "item-up", index, itemIndex, itemIndex === 0)}${action("↓ Descer item", "item-down", index, itemIndex, itemIndex === section.itens.length - 1)}${action("Remover item", "item-remove", index, itemIndex)}</div></div>`).join("")}${action("Adicionar item", "item-add", index, undefined, section.itens.length >= 100)}</fieldset>`).join("") + action("Adicionar secção", "section-add", undefined, undefined, draft.secoes.length >= 100);
    }
    return `<h3>Editar: ${escape(key)}</h3><p class="muted">Texto simples; o HTML não é executado. Para imagens locais usa <code>images/nome.png</code>.</p>${field("Título", draft.titulo, "titulo", { required: true })}${field("Subtítulo", draft.subtitulo, "subtitulo", { multiline: true })}${sections}<div class="actions"><button class="primary" type="submit">Guardar neste navegador</button>${action("Recarregar conteúdo guardado", "reload")}</div><p class="muted editor-status">As alterações só se aplicam depois de guardar.</p>`;
  }

  function mountEditor(container, key) {
    let base = JSON.stringify(page(key)), draft = clone(page(key).conteudo);
    const form = document.createElement("form");
    form.className = "cms-editor";
    form.dataset.editor = key;
    container.replaceChildren(form);
    const draw = () => { form.innerHTML = editorMarkup(draft, key); };
    draw();
    function update(event) {
      const target = event.target;
      if (!target.dataset.property) return;
      let obj = draft;
      if (target.dataset.section !== undefined) obj = draft.secoes[Number(target.dataset.section)];
      if (target.dataset.item !== undefined) obj = obj.itens[Number(target.dataset.item)];
      obj[target.dataset.property] = target.value;
      form.dataset.dirty = "true";
    }
    form.addEventListener("input", update);
    form.addEventListener("change", update);
    form.addEventListener("click", (event) => {
      const button = event.target.closest("[data-editor-action]");
      if (!button) return;
      event.preventDefault();
      guard(() => {
        const action = button.dataset.editorAction, s = Number(button.dataset.section), i = Number(button.dataset.item);
        if (action === "reload") {
          if (form.dataset.dirty === "true" && !confirm("Descartar o rascunho e recarregar o conteúdo guardado?")) return;
          state = loadState(true); base = JSON.stringify(page(key)); draft = clone(page(key).conteudo); form.dataset.dirty = "false"; draw(); return;
        }
        if (action === "section-add") { check(draft.secoes.length < 100, "Limite de secções atingido."); draft.secoes.push({ id: id(), tipo: "texto", etiqueta: "", titulo: "Nova secção", texto: "", imagem: "", itens: [] }); }
        if (action === "section-remove") draft.secoes.splice(s, 1);
        if (action === "section-up" || action === "section-down") { const to = s + (action === "section-up" ? -1 : 1); if (to >= 0 && to < draft.secoes.length) [draft.secoes[s], draft.secoes[to]] = [draft.secoes[to], draft.secoes[s]]; }
        if (action === "item-add") { check(draft.secoes[s].itens.length < 100, "Limite de itens atingido."); draft.secoes[s].itens.push({ id: id(), titulo: "Novo item", texto: "" }); }
        if (action === "item-remove") draft.secoes[s].itens.splice(i, 1);
        if (action === "item-up" || action === "item-down") { const items = draft.secoes[s].itens, to = i + (action === "item-up" ? -1 : 1); if (to >= 0 && to < items.length) [items[i], items[to]] = [items[to], items[i]]; }
        form.dataset.dirty = "true"; draw();
      });
    });
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      guard(() => {
        const content = validateContent(draft, key);
        transaction((data) => {
          check(canEdit(key, data, actor(data)), "O perfil atual já não pode editar esta página.");
          const current = page(key, data);
          check(JSON.stringify(current) === base, "Esta página mudou noutro separador. O rascunho foi preservado. Copia o texto antes de recarregar o conteúdo guardado.");
          data.paginas[key] = { ...current, conteudo: content, revisao: current.revisao + 1 };
        });
        form.dataset.dirty = "false";
        render(); flash("Conteúdo guardado neste navegador. Para partilhar os textos, exporta conteudo.js na Gestão e substitui-o no GitHub.");
      });
    });
  }

  function download(filename, content, type) {
    const blob = new Blob([content], { type }), url = URL.createObjectURL(blob), link = document.createElement("a");
    link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  function exportContent() {
    state = loadState(true); command(state);
    const pages = Object.fromEntries(PAGE_KEYS.map((key) => [key, clone(page(key))]));
    download("conteudo.js", `// Conteúdo público USHE. Substitui este ficheiro no repositório do GitHub.\nwindow.USHE_CONTENT = ${JSON.stringify({ versao: 1, paginas: pages }, null, 2)};\n`, "text/javascript;charset=utf-8");
    flash("conteudo.js descarregado. Substitui esse ficheiro no GitHub para publicar os textos para todos.");
  }

  function exportBackup() {
    state = loadState(true); command(state);
    download(`ushe-copia-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ tipo: "ushe-backup-local", versao: 1, exportadoEm: new Date().toISOString(), dados: state }, null, 2), "application/json;charset=utf-8");
    flash("Cópia local descarregada. Guarda-a fora do navegador.");
  }

  async function importBackup(file) {
    if (!file) return;
    try {
      command(state);
      check(file.size <= 20 * 1024 * 1024, "O ficheiro é demasiado grande para importar neste navegador (máximo 20 MB).");
      const backup = JSON.parse(await file.text());
      check(backup.tipo === "ushe-backup-local" && backup.versao === 1, "Este ficheiro não é uma cópia local USHE compatível.");
      const incoming = validateState(backup.dados);
      const fresh = loadState(true); command(fresh);
      const wasChanged = JSON.stringify(fresh) !== JSON.stringify(state);
      check(!wasChanged, "Os dados mudaram enquanto o ficheiro era lido. Volta a selecionar a cópia.");
      if (!confirm(`Substituir todos os dados locais por esta cópia?\n\n${incoming.perfis.length} perfis · ${incoming.eventos.length} eventos · ${incoming.votos.length} respostas\n\nEsta operação não junta dados. Exporta primeiro a cópia atual se a quiseres guardar.`)) return;
      incoming.revisao = fresh.revisao + 1;
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(incoming)); }
      catch { throw new Error("Não foi possível importar. O armazenamento pode estar cheio ou bloqueado. Os dados anteriores foram preservados."); }
      state = incoming; setSession(""); render(); location.hash = "/entrar";
      flash("Cópia importada neste navegador. Escolhe um perfil local para continuar.");
    } catch (error) { flash(error.message || "Não foi possível importar o ficheiro.", true); }
    finally { const input = $("#import-backup"); if (input) input.value = ""; }
  }

  function resetStorage() {
    if (!confirm("Apagar todos os perfis, eventos, respostas, permissões e edições locais deste portal neste navegador?\n\nOs ficheiros publicados no GitHub não são alterados.")) return;
    try { localStorage.removeItem(STORAGE_KEY); }
    catch { throw new Error("O navegador está a bloquear o armazenamento. Permite dados do site nas definições para usar perfis e guardar alterações."); }
    state = EMPTY(); storageProblem = ""; damagedData = ""; setSession("");
    render(); location.hash = "/"; flash("Os dados locais deste portal foram repostos. O conteúdo publicado foi mantido.");
  }

  function onAction(event) {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    guard(() => {
      const action = button.dataset.action;
      if (action === "logout") { if (!discardDraft()) return; setSession(""); render(); flash("Saíste do perfil local."); }
      if (action === "vote") {
        const eventId = button.dataset.event, response = button.dataset.response;
        transaction((data) => {
          const person = actor(data);
          check(data.eventos.some((record) => record.id === eventId) && ["vou", "nao_vou"].includes(response), "Evento ou resposta inválidos.");
          data.votos = data.votos.filter((vote) => !(vote.evento_id === eventId && vote.utilizador_id === person.id));
          data.votos.push({ evento_id: eventId, utilizador_id: person.id, resposta: response });
        });
        renderEventsList(); flash("Resposta guardada neste navegador. Podes alterá-la a qualquer momento.");
        $(`[data-event="${eventId}"][data-response="${response}"]`)?.focus({ preventScroll: true });
      }
      if (action === "export-content") exportContent();
      if (action === "export-backup") exportBackup();
      if (action === "export-damaged") download("ushe-dados-para-recuperacao.txt", damagedData, "text/plain;charset=utf-8");
      if (action === "reset-storage") resetStorage();
      if (action === "published-content") {
        if (!discardDraft()) return;
        if (!confirm("Remover as edições locais dos textos e usar o conteudo.js publicado? Os perfis, eventos, votos e permissões locais serão mantidos.")) return;
        transaction((data) => { command(data); data.paginas = {}; });
        render(); flash("O navegador passou a usar os textos do ficheiro publicado. Recarrega a página para obter uma publicação mais recente.");
      }
    });
  }

  function onSubmit(event) {
    const form = event.target;
    if (!["create-profile-form", "select-profile-form", "create-event-form"].includes(form.id)) return;
    event.preventDefault();
    guard(() => {
      const values = new FormData(form), get = (key) => String(values.get(key) ?? "").trim();
      if (form.id === "create-profile-form") {
        const name = get("nome");
        text(name, 100, "Nome", true); check(name.length >= 2, "O nome tem de ter pelo menos dois caracteres.");
        const profileId = id();
        transaction((data) => {
          check(!data.perfis.some((p) => nameKey(p.nome) === nameKey(name)), "Já existe um perfil local com esse nome. Seleciona-o na lista.");
          data.perfis.push({ id: profileId, nome: name, cargo: data.perfis.length ? "Estagiário" : "Comando" });
        });
        form.dataset.dirty = "false"; setSession(profileId); render(); flash("Perfil local criado e selecionado neste navegador.");
      }
      if (form.id === "select-profile-form") {
        const selected = get("perfil"); state = loadState(true);
        check(state.perfis.some((p) => p.id === selected), "Esse perfil já não existe. Atualiza a página.");
        if (!discardDraft()) return;
        setSession(selected); render(); flash("Perfil local selecionado.");
      }
      if (form.id === "create-event-form") {
        const eventId = id(), start = lisbonInstant(get("data"), get("inicio")), end = lisbonInstant(get("data"), get("termino"));
        transaction((data) => {
          const person = actor(data);
          data.eventos.push(validateEvent({ id: eventId, titulo: get("titulo"), descricao: get("descricao"), local: get("local"), inicio: start, termino: end, criado_por: person.id }));
        });
        form.reset(); form.dataset.dirty = "false"; ui.eventFilter = "todos"; $("#event-filter").value = "todos";
        renderEventsList(); flash("Evento criado e guardado neste navegador.");
      }
    });
  }

  function onChange(event) {
    const target = event.target;
    if (target.id === "import-backup") { void importBackup(target.files[0]); return; }
    if (target.id === "event-filter") { ui.eventFilter = target.value; renderEventsList(); return; }
    if (target.id === "page-selector") {
      if (!discardDraft()) { target.value = ui.selectedPage; return; }
      ui.selectedPage = target.value; mountEditor($("#management-editor"), ui.selectedPage); return;
    }
    if (target.id !== "home-public" && !target.dataset.roleFor && !target.dataset.permissionFor) return;
    if (!discardDraft()) {
      if (target.id === "home-public") target.checked = target.defaultChecked;
      else target.value = [...target.options].find((option) => option.defaultSelected)?.value ?? target.options[0].value;
      return;
    }
    guard(() => {
      transaction((data) => {
        command(data);
        if (target.id === "home-public") { const current = page("inicio", data); data.paginas.inicio = { ...clone(current), publica: target.checked, revisao: current.revisao + 1 }; }
        if (target.dataset.roleFor) {
          const person = data.perfis.find((p) => p.id === target.dataset.roleFor);
          check(person && ROLES.includes(target.value), "Perfil ou cargo inválido.");
          check(!(person.cargo === "Comando" && target.value !== "Comando" && data.perfis.filter((p) => p.cargo === "Comando").length === 1), "Tem de existir pelo menos um perfil Comando neste navegador.");
          person.cargo = target.value;
        }
        if (target.dataset.permissionFor) {
          const personId = target.dataset.permissionFor, key = target.dataset.page, mode = target.value;
          check(data.perfis.some((p) => p.id === personId) && DELEGATED_PAGES.includes(key) && ["padrao", "nenhum", "ver", "editar"].includes(mode), "Permissão inválida.");
          data.permissoes = data.permissoes.filter((p) => !(p.utilizador_id === personId && p.pagina === key));
          if (mode !== "padrao") data.permissoes.push({ utilizador_id: personId, pagina: key, pode_ver: mode !== "nenhum", pode_editar: mode === "editar" });
        }
      });
      render(); flash("Preferência guardada neste navegador.");
    });
    // Se a validação recusar a alteração, repõe o valor apresentado.
    if (target.isConnected) render();
  }

  function hasDraft() { return Boolean($('form[data-dirty="true"]')); }
  function discardDraft() { return !hasDraft() || confirm("Existem alterações por guardar. Queres descartar esse rascunho?"); }

  function start() {
    try {
      check(object(window.USHE_CONTENT) && window.USHE_CONTENT.versao === 1 && object(window.USHE_CONTENT.paginas), "O ficheiro conteudo.js está em falta ou é incompatível.");
      defaults = Object.fromEntries(PAGE_KEYS.map((key) => [key, validatePage(window.USHE_CONTENT.paginas[key], key)]));
      state = loadState();
      try { sessionId = sessionStorage.getItem(SESSION_KEY) || ""; } catch { /* Sessão apenas em memória. */ }
      if (sessionId && !profile()) setSession("");
      document.addEventListener("click", onAction);
      document.addEventListener("submit", onSubmit);
      document.addEventListener("change", onChange);
      document.addEventListener("input", (event) => { const form = event.target.closest("form"); if (form && form.id !== "select-profile-form") form.dataset.dirty = "true"; });
      $(".skip-link").addEventListener("click", (event) => { event.preventDefault(); $("#conteudo-principal").focus(); $("#conteudo-principal").scrollIntoView(); });
      document.addEventListener("click", (event) => {
        const link = event.target.closest('a[href^="#/"]');
        if (link && link.hash !== location.hash) {
          if (!discardDraft()) event.preventDefault();
          else ui.navigationApproved = true;
        }
      });
      window.addEventListener("hashchange", (event) => {
        if (!ui.navigationApproved && !discardDraft()) {
          history.replaceState(null, "", event.oldURL);
          return;
        }
        ui.navigationApproved = false;
        $("#feedback").hidden = true;
        render(true);
      });
      window.addEventListener("beforeunload", (event) => { if (hasDraft()) { event.preventDefault(); event.returnValue = ""; } });
      window.addEventListener("storage", (event) => {
        if (event.key !== STORAGE_KEY && event.key !== null) return;
        state = loadState();
        if (!profile()) setSession("");
        renderHeader();
        if (hasDraft()) flash("Os dados mudaram noutro separador. O rascunho foi mantido; verifica o conteúdo antes de guardar.");
        else renderMain();
      });
      window.addEventListener("focus", () => {
        const next = loadState();
        if (JSON.stringify(next) === JSON.stringify(state)) return;
        state = next;
        if (!profile()) setSession("");
        renderHeader();
        if (!hasDraft()) renderMain();
      });
      render();
    } catch (error) {
      $("#conteudo-principal").innerHTML = `<div class="panel"><h1>Não foi possível abrir o portal</h1><p class="error">${escape(error.message)}</p><p>Confirma que index.html, style.css, script.js, conteudo.js e a pasta images estão juntos na raiz do site.</p></div>`;
    }
  }

  start();
})();
