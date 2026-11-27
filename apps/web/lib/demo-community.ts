/** Avaliações fictícias exibidas na comunidade das obras de demonstração. */
export const demoEvaluations = [
  { name: "Clara", rating: 9, review: "Gostei de como a fotografia muda com o clima da história.", spoiler: false },
  { name: "Rafael", rating: 6, review: "A atmosfera me ganhou, mas achei o começo lento.", spoiler: false },
  {
    name: "Bia",
    rating: 10,
    review: "A escolha da personagem na cena final mudou minha leitura da história. Este comentário é fictício.",
    spoiler: true,
  },
  { name: "Diego", rating: 7, review: null, spoiler: false },
];
export const demoSum = demoEvaluations.reduce((sum, item) => sum + item.rating, 0);
export const demoEpisodeRatings = [
  { viewer: "Clara", episode: 1, rating: 9 },
  { viewer: "Clara", episode: 2, rating: 8 },
  { viewer: "Rafael", episode: 1, rating: 6 },
  { viewer: "Bia", episode: 2, rating: 10 },
  { viewer: "Diego", episode: 3, rating: 7 },
];
/** Nomes das obras fictícias do catálogo de demonstração, por id. */
export const demoTitleNames: Record<string, string> = {
  "demo-ultimo-rolo": "O Último Rolo",
  "demo-mare-alta": "Maré Alta",
  "demo-lua-de-papel": "Lua de Papel",
  "demo-neon-norte": "Neon Norte",
  "demo-fim-da-linha": "Fim da Linha",
  "demo-arquipelago": "Arquipélago",
};
