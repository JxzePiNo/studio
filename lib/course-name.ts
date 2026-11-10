const smallWords = new Set(["a", "ad", "al", "allo", "alla", "ai", "agli", "alle", "da", "dal", "dallo", "dalla", "dai", "dagli", "dalle", "di", "del", "dello", "della", "dei", "degli", "delle", "e", "ed", "o", "od", "in", "nel", "nello", "nella", "nei", "negli", "nelle", "con", "su", "sul", "sullo", "sulla", "sui", "sugli", "sulle", "per", "tra", "fra", "il", "lo", "la", "i", "gli", "le", "un", "uno", "una", "of", "the", "and", "or", "nor", "but", "for", "so", "yet", "as", "at", "by", "on", "to", "via", "with", "from", "into", "over", "an", "without"]);

/** Display formatting only: stored course names remain unchanged. */
export function formatCourseName(name: string) {
  let index = 0;
  return name.trim().split(/(\s+|[-/])/u).map(part => {
    if (!/[\p{L}\p{N}]/u.test(part)) return part;
    const first = index++ === 0;
    const lower = part.toLocaleLowerCase("it-IT");
    const word = lower.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
    if (!first && smallWords.has(word)) return lower;
    const elision = lower.match(/^(dell|all|nell|sull|dall|l|un)(['’])(.+)$/u);
    if (elision) return `${first ? elision[1][0].toLocaleUpperCase("it-IT") + elision[1].slice(1) : elision[1]}${elision[2]}${elision[3].replace(/\p{L}/u, letter => letter.toLocaleUpperCase("it-IT"))}`;
    return lower.replace(/\p{L}/u, letter => letter.toLocaleUpperCase("it-IT"));
  }).join("");
}
