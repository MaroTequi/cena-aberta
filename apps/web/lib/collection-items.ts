// Operações puras sobre a lista ordenada de obras de uma coleção (a ordem do array vira a posição).

/**
 * Move uma obra uma ou mais posições.
 * @param titles lista atual
 * @param index posição da obra
 * @param delta deslocamento (-1 sobe, 1 desce)
 * @returns nova lista; a mesma ordem quando o destino sai dos limites
 */
export function moveTitle(titles: string[], index: number, delta: number): string[] {
  const target = index + delta;
  if (index < 0 || index >= titles.length || target < 0 || target >= titles.length) return titles.slice();
  const next = titles.slice();
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item);
  return next;
}

/**
 * Acrescenta a obra no fim, sem repetir.
 * @returns nova lista (igual à anterior se a obra já estava)
 */
export function addTitle(titles: string[], title: string): string[] {
  return titles.includes(title) ? titles.slice() : [...titles, title];
}

/**
 * Remove a obra da lista.
 * @returns nova lista sem a obra
 */
export function removeTitle(titles: string[], title: string): string[] {
  return titles.filter((item) => item !== title);
}
