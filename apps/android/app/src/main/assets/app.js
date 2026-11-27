"use strict";
const works = [
  [
    "mare",
    "Maré Alta",
    "Séries",
    "tide",
    "2025",
    "Uma fotógrafa volta à cidade onde cresceu e encontra segredos entre as marés.",
    [["Piloto", "Segundo episódio"], ["O retorno"]],
  ],
  [
    "rolo",
    "O Último Rolo",
    "Filmes",
    "reel",
    "2024",
    "Uma projecionista procura o último filme de uma sala prestes a fechar.",
  ],
  [
    "lua",
    "Lua de Papel",
    "Animes",
    "moon",
    "2023",
    "Uma aprendiz de cartógrafa desenha um caminho para casa num céu em constante mudança.",
  ],
  [
    "neon",
    "Neon Norte",
    "Filmes",
    "neon",
    "2025",
    "Uma noite na cidade aproxima dois desconhecidos.",
  ],
  [
    "linha",
    "Fim da Linha",
    "Séries",
    "line",
    "2024",
    "No último trem, cada passageiro guarda uma história.",
    [["Partida", "A plataforma"]],
  ],
  [
    "ilhas",
    "Arquipélago",
    "Animes",
    "isle",
    "2025",
    "Dois viajantes procuram uma ilha que desapareceu dos mapas.",
    [["A carta", "Farol"]],
  ],
];
const groups = ["Todos", "Filmes", "Séries", "Animes"];
const all = new Map(),
  roots = [];
function add(id, name, kind, art, year, summary, parent = null) {
  const item = { id, name, kind, art, year, summary, parent, children: [] };
  all.set(id, item);
  if (parent) all.get(parent).children.push(item);
  else roots.push(item);
  return item;
}
for (const [id, name, kind, art, year, summary, seasons] of works) {
  add(id, name, kind, art, year, summary);
  (seasons || []).forEach((episodes, s) => {
    const key = id + "-s" + (s + 1);
    add(key, "Temporada " + (s + 1), "Temporada", art, year, name, id);
    episodes.forEach((ep, e) =>
      add(
        key + "-e" + (e + 1),
        ep,
        "Episódio",
        art,
        year,
        name + " · T" + (s + 1) + " E" + (e + 1),
        key,
      ),
    );
  });
}
const base = {
  name: "Visitante",
  light: false,
  log: [],
  reviews: {},
  ratings: {},
  later: [],
  votes: {},
  guestVotes: {},
  guest: "",
  friends: [],
};
const key = "cena-demo-android-v1";
let data = { ...base },
  filter = "Todos",
  query = "",
  storageError = false;
try {
  data = { ...base, ...JSON.parse(localStorage.getItem(key) || "{}") };
} catch {
  storageError = true;
}
function save() {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    storageError = true;
  }
}
function esc(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}
const page = document.querySelector("main");
function card(w) {
  return (
    '<a class="card" href="#obra/' +
    w.id +
    '"><div class="art ' +
    w.art +
    '" aria-hidden="true">' +
    esc(w.name) +
    "</div><strong>" +
    esc(w.name) +
    "</strong><small>" +
    w.kind +
    "</small></a>"
  );
}
function grid(list) {
  return list.length
    ? '<div class="grid">' + list.map(card).join("") + "</div>"
    : '<p class="sub">Nenhuma obra encontrada.</p>';
}
function escLabel(id) {
  return esc(all.get(id)?.name || id);
}
function leaves(w) {
  return w.children.length ? w.children.flatMap(leaves) : [w];
}
function played(w) {
  return data.log.some((row) => row.id === w.id);
}
function average(w) {
  if (!w.children.length) return data.ratings[w.id] || 0;
  const values = w.children.map(average).filter(Boolean);
  if (!values.length) return 0;
  const n = values.reduce((a, b) => a + b, 0) / values.length;
  return (
    (w.kind === "Temporada" ? Math.ceil(n * 2 - 0.5) : Math.ceil(n * 2)) / 2
  );
}
function displayScore(w) {
  const v = average(w);
  return v ? v.toLocaleString("pt-BR") + " / 5" : "Sem nota";
}
function back(route, label) {
  return '<a class="back" href="#' + route + '">‹ ' + esc(label) + "</a>";
}
function filtered() {
  return roots.filter(
    (w) =>
      (filter === "Todos" || filter === w.kind) &&
      w.name
        .toLocaleLowerCase("pt-BR")
        .includes(query.trim().toLocaleLowerCase("pt-BR")),
  );
}
function explore() {
  return (
    '<div class="hero"><div><div class="kicker">Série em destaque</div><h1>Maré Alta</h1><p>Um retorno ao litoral. Duas temporadas de segredos.</p><a href="#obra/mare">Conhecer a série →</a></div></div><section><h2>Catálogo</h2><label><input id="search" type="search" aria-label="Buscar no catálogo" placeholder="Buscar filme, série ou anime" value="' +
    esc(query) +
    '"></label><div class="filters">' +
    groups
      .map(
        (g) =>
          '<button data-filter="' +
          g +
          '" aria-pressed="' +
          (filter === g) +
          '">' +
          g +
          "</button>",
      )
      .join("") +
    '</div><div id="results">' +
    grid(filtered()) +
    '</div></section><div class="row"><a class="pill" href="#recomendacoes">Recomendações</a><a class="pill" href="#resenhas">Resenhas</a><a class="pill" href="#noticias">Notícias</a></div>'
  );
}
function detail(w) {
  const seen = leaves(w).filter(played).length,
    total = leaves(w).length;
  const status = w.children.length
    ? seen === total
      ? "Vi completamente"
      : seen
        ? "Já vi"
        : "Ainda não vi"
    : seen
      ? "Já vi"
      : "Ainda não vi";
  return (
    back(
      w.parent ? "obra/" + w.parent : "explorar",
      w.parent ? all.get(w.parent).name : "Explorar",
    ) +
    '<div class="detail"><div class="art ' +
    w.art +
    '" aria-hidden="true">' +
    esc(w.name) +
    '</div><div><div class="kicker">' +
    w.kind +
    " · " +
    w.year +
    "</div><h1>" +
    esc(w.name) +
    "</h1><p>" +
    esc(w.summary) +
    "</p><small>" +
    status +
    '</small></div></div><div class="row"><button data-act="later" aria-pressed="' +
    data.later.includes(w.id) +
    '">Vou ver</button>' +
    (!w.children.length
      ? '<button class="primary" data-act="view">' +
        (seen ? "Vi novamente" : "Registrar sessão") +
        "</button>"
      : "") +
    "</div>" +
    (w.children.length
      ? "<section><h2>" +
        (w.kind === "Temporada" ? "Episódios" : "Temporadas") +
        '</h2><p class="sub">' +
        seen +
        " de " +
        total +
        " episódios vistos · Média: " +
        displayScore(w) +
        "</p>" +
        grid(w.children) +
        "</section>"
      : '<label>Minha nota<select id="rating"><option value="0">Sem nota</option>' +
        Array.from({ length: 10 }, (_, i) => (i + 1) / 2)
          .map(
            (v) =>
              '<option value="' +
              v +
              '" ' +
              (data.ratings[w.id] === v ? "selected" : "") +
              ">" +
              v.toLocaleString("pt-BR") +
              " / 5</option>",
          )
          .join("") +
        "</select></label>") +
    '<form id="review"><label>Minha resenha<textarea name="text" maxlength="3000">' +
    esc(data.reviews[w.id] || "") +
    '</textarea></label><button>Salvar resenha</button></form><p role="status" class="notice" id="notice"></p>'
  );
}
function diary() {
  return (
    '<h1>Meu diário</h1><p class="sub">Sessões registradas neste aparelho.</p>' +
    (data.log.length
      ? data.log
          .slice()
          .reverse()
          .map(
            (r) =>
              '<div class="entry"><a href="#obra/' +
              r.id +
              '"><small>' +
              new Date(r.time).toLocaleDateString("pt-BR") +
              "</small><strong>" +
              escLabel(r.id) +
              '</strong></a><button data-remove="' +
              r.key +
              '">Remover sessão</button></div>',
          )
          .join("")
      : "<p>Abra uma obra ou episódio e toque em Registrar sessão.</p>")
  );
}
function ranking() {
  return (
    "<h1>Meu ranking</h1>" +
    groups
      .slice(1)
      .map((g) => {
        const group = roots.filter((w) => w.kind === g);
        const board = (name, list) =>
          "<section><h2>" +
          name +
          "</h2>" +
          (list
            .filter((w) => average(w) > 0)
            .sort((a, b) => average(b) - average(a))
            .map(
              (w) =>
                '<a class="entry" href="#obra/' +
                w.id +
                '"><strong>' +
                esc(w.name) +
                "</strong>" +
                displayScore(w) +
                "</a>",
            )
            .join("") || '<p class="sub">Sem avaliações.</p>') +
          "</section>";
        return (
          board(g, group) +
          (g !== "Filmes"
            ? board(
                "Episódios de " + g.toLowerCase(),
                group.flatMap(leaves).filter((w) => w.kind === "Episódio"),
              )
            : "")
        );
      })
      .join("")
  );
}
function profile() {
  return (
    '<h1>Meu perfil</h1><p class="sub">Perfil demonstrativo deste aparelho.</p><form id="profile"><label>Nome<input name="name" maxlength="50" required value="' +
    esc(data.name) +
    '"></label><button>Salvar nome</button></form><p role="status" id="notice"></p><div class="row"><button data-act="theme">Tema ' +
    (data.light ? "claro" : "escuro") +
    '</button><a class="pill" href="#ranking">Meu ranking</a><a class="pill" href="#amigos">Amigos</a></div><section><h2>Vou ver</h2>' +
    (data.later.length
      ? grid(data.later.map((id) => all.get(id)).filter(Boolean))
      : '<p class="sub">Sua seleção aparece aqui.</p>') +
    "</section>"
  );
}
function friends() {
  const people = ["Lia", "Caio", "Nina"];
  return (
    back("perfil", "Meu perfil") +
    '<h1>Amigos</h1><p class="sub">Perfis fictícios para experimentar a sua lista.</p>' +
    people
      .map(
        (person) =>
          '<div class="entry row"><strong>' +
          person +
          '</strong><button data-friend="' +
          person +
          '" aria-pressed="' +
          data.friends.includes(person) +
          '">' +
          (data.friends.includes(person) ? "Remover" : "Adicionar") +
          "</button></div>",
      )
      .join("")
  );
}
function guestRound() {
  const next = roots.find((w) => !data.guestVotes[w.id]);
  if (next)
    return (
      '<h1>Sélete</h1><p class="sub">Vez de ' +
      esc(data.guest) +
      '. Passe o aparelho para a segunda pessoa.</p><div class="detail"><div class="art ' +
      next.art +
      '">' +
      esc(next.name) +
      "</div><div><h2>" +
      esc(next.name) +
      "</h2><p>" +
      esc(next.summary) +
      '</p></div></div><div class="row"><button data-guestvote="skip">Passar</button><button class="primary" data-guestvote="yes">Assistiria</button></div>'
    );
  const matches = roots.filter(
    (w) => data.votes[w.id] === "yes" && data.guestVotes[w.id] === "yes",
  );
  return (
    "<h1>Sélete</h1><section><h2>Escolhas em comum</h2>" +
    (matches.length
      ? grid(matches)
      : "<p>Nenhuma escolha em comum nesta rodada.</p>") +
    '<button data-act="restart">Nova rodada</button></section>'
  );
}
function selete() {
  if (data.guest) return guestRound();
  const next = roots.find((w) => !data.votes[w.id]);
  return (
    '<h1>Sélete</h1><p class="sub">Rodada individual de demonstração. Escolha quais obras entrariam na sua sessão.</p>' +
    (next
      ? '<div class="detail"><div class="art ' +
        next.art +
        '">' +
        esc(next.name) +
        "</div><div><h2>" +
        esc(next.name) +
        "</h2><p>" +
        esc(next.summary) +
        '</p></div></div><div class="row"><button data-vote="skip">Passar</button><button class="primary" data-vote="yes">Assistiria</button></div>'
      : "<section><h2>Escolhas da rodada</h2>" +
        grid(roots.filter((w) => data.votes[w.id] === "yes")) +
        '<form id="guest"><label>Segunda pessoa<input name="name" maxlength="50" required placeholder="Nome da pessoa"></label><button>Comparar escolhas no mesmo aparelho</button></form><p><button data-act="restart">Nova rodada</button></p></section>')
  );
}
function editorial(tab) {
  if (tab === "resenhas")
    return (
      "<h1>Resenhas</h1>" +
      (Object.entries(data.reviews)
        .filter(([, s]) => s.trim())
        .map(
          ([id, s]) =>
            '<a class="entry" href="#obra/' +
            id +
            '"><strong>' +
            escLabel(id) +
            '</strong><p class="review">' +
            esc(s) +
            "</p></a>",
        )
        .join("") ||
        '<p class="sub">Suas resenhas aparecerão aqui depois de salvas.</p>')
    );
  if (tab === "noticias")
    return '<h1>Notícias</h1><small>BOLETIM DEMONSTRATIVO</small><a class="entry" href="#obra/mare"><strong>Maré Alta em foco</strong>Explore os episódios das duas temporadas. →</a>';
  return (
    "<h1>Recomendações</h1>" +
    groups
      .slice(1)
      .map(
        (g) =>
          "<section><h2>" +
          g +
          "</h2>" +
          grid(roots.filter((w) => w.kind === g)) +
          "</section>",
      )
      .join("")
  );
}
function route() {
  return location.hash.slice(1).split("/");
}
function render() {
  const [tab = "explorar", id] = route(),
    w = all.get(id);
  document.documentElement.classList.toggle("light", data.light);
  page.innerHTML =
    tab === "obra" && w
      ? detail(w)
      : tab === "amigos"
        ? friends()
        : tab === "perfil"
          ? profile()
          : tab === "diario"
            ? diary()
            : tab === "selete"
              ? selete()
              : tab === "ranking"
                ? back("perfil", "Meu perfil") + ranking()
                : ["resenhas", "recomendacoes", "noticias"].includes(tab)
                  ? back("explorar", "Explorar") + editorial(tab)
                  : explore();
  if (storageError)
    page.insertAdjacentHTML(
      "beforeend",
      '<p role="alert">Armazenamento indisponível. As mudanças valem apenas nesta sessão.</p>',
    );
  const current = ["perfil", "ranking", "amigos"].includes(tab)
    ? "perfil"
    : ["diario", "selete"].includes(tab)
      ? tab
      : "explorar";
  document.querySelectorAll("nav a").forEach((a) => {
    if (a.hash === "#" + current) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
}
page.addEventListener("input", (e) => {
  if (e.target.id === "search") {
    query = e.target.value;
    document.querySelector("#results").innerHTML = grid(filtered());
  }
});
page.addEventListener("change", (e) => {
  if (e.target.id === "rating") {
    const id = route()[1],
      v = Number(e.target.value);
    if (v) data.ratings[id] = v;
    else delete data.ratings[id];
    save();
    document.querySelector("#notice").textContent = "Nota salva.";
  }
});
page.addEventListener("submit", (e) => {
  e.preventDefault();
  const f = e.target;
  if (f.id === "review")
    data.reviews[route()[1]] = f.elements.text.value.trim();
  else if (f.id === "guest") {
    data.guest = f.elements.name.value.trim() || "Convidado";
    save();
    render();
    return;
  } else if (f.id === "profile")
    data.name = f.elements.name.value.trim() || "Visitante";
  save();
  render();
  document.querySelector("#notice").textContent = "Alterações salvas.";
});
page.addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  const { act, filter: f, vote, remove } = b.dataset;
  const id = route()[1];
  if (b.dataset.friend) {
    const name = b.dataset.friend;
    data.friends = data.friends.includes(name)
      ? data.friends.filter((x) => x !== name)
      : [...data.friends, name];
    save();
    render();
    return;
  }
  if (b.dataset.guestvote) {
    const next = roots.find((w) => !data.guestVotes[w.id]);
    if (next) data.guestVotes[next.id] = b.dataset.guestvote;
    save();
    render();
    return;
  }
  if (f) {
    filter = f;
    render();
    return;
  }
  if (vote) {
    const next = roots.find((w) => !data.votes[w.id]);
    if (next) data.votes[next.id] = vote;
  } else if (remove) {
    if (!window.confirm("Remover esta sessão do diário?")) return;
    data.log = data.log.filter((r) => r.key !== remove);
  } else if (act === "later") {
    data.later = data.later.includes(id)
      ? data.later.filter((x) => x !== id)
      : [...data.later, id];
  } else if (act === "view")
    data.log.push({
      key:
        Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8),
      id,
      time: Date.now(),
    });
  else if (act === "theme") data.light = !data.light;
  else if (act === "restart") {
    data.votes = {};
    data.guestVotes = {};
    data.guest = "";
  } else return;
  save();
  render();
  if (act === "view")
    document.querySelector("#notice").textContent =
      "Sessão registrada no diário.";
});
window.addEventListener("hashchange", () => {
  render();
  window.scrollTo(0, 0);
  page.focus({ preventScroll: true });
});
render();
