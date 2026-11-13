// Selected suggestions from the MUR catalogue; custom institutions are accepted.
export const UNIVERSITY_SOURCE = "https://www.mur.gov.it/it/aree-tematiche/universita/le-universita/universita-statali";
export const UNIVERSITIES = [
  { label: "Università degli Studi di Firenze", aliases: "unifi firenze florence" },
  { label: "Università degli Studi di Siena", aliases: "unisi siena" },
  { label: "Università degli Studi di Perugia", aliases: "unipg perugia" },
  { label: "Università degli Studi di Pisa", aliases: "unipi pisa" },
  { label: "Università per Stranieri di Siena", aliases: "unistrasi stranieri siena" },
  { label: "Università per Stranieri di Perugia", aliases: "unistrapg stranieri perugia" },
  { label: "Università degli Studi di Roma La Sapienza", aliases: "sapienza uniroma1 roma" },
  { label: "Università degli Studi di Roma Tor Vergata", aliases: "torvergata uniroma2 roma" },
  { label: "Università degli Studi di Roma Tre", aliases: "romatre uniroma3 roma" },
  { label: "Università degli Studi di Roma Foro Italico", aliases: "uniroma4 foro italico roma" },
  { label: "Università degli Studi di Milano", aliases: "unimi statale milano" },
  { label: "Università degli Studi di Milano Bicocca", aliases: "unimib bicocca milano" },
  { label: "Politecnico di Milano", aliases: "polimi politecnico milano" },
  { label: "Università degli Studi di Torino", aliases: "unito torino turin" },
  { label: "Politecnico di Torino", aliases: "polito politecnico torino" },
  { label: "Università degli Studi di Bologna", aliases: "unibo alma mater bologna" },
  { label: "Università degli Studi di Padova", aliases: "unipd padova" },
  { label: "Università degli Studi di Trento", aliases: "unitn trento" },
  { label: "Università degli Studi di Genova", aliases: "unige genova" },
  { label: "Università Ca’ Foscari Venezia", aliases: "unive ca foscari venezia" },
  { label: "Università degli Studi di Verona", aliases: "univr verona" },
  { label: "Università degli Studi di Ferrara", aliases: "unife ferrara" },
  { label: "Università degli Studi di Parma", aliases: "unipr parma" },
  { label: "Università degli Studi di Modena e Reggio Emilia", aliases: "unimore modena reggio emilia" },
  { label: "Università degli Studi di Napoli Federico II", aliases: "unina federico secondo napoli" },
  { label: "Università degli Studi di Bari Aldo Moro", aliases: "uniba bari" },
  { label: "Politecnico di Bari", aliases: "poliba politecnico bari" },
  { label: "Università Politecnica delle Marche", aliases: "univpm ancona politecnica marche" },
  { label: "Università degli Studi di Cagliari", aliases: "unica cagliari" },
  { label: "Università degli Studi di Palermo", aliases: "unipa palermo" },
  { label: "Università degli Studi di Catania", aliases: "unict catania" },
  { label: "Università degli Studi di Messina", aliases: "unime messina" },
] as const;
export function normalizeUniversity(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("it").replace(/[^a-z0-9]+/g, " ").replace(/\bmialno\b/g, "milano").replace(/\b(universita|degli|studi|di|delle|della)\b/g, " ").replace(/\s+/g, " ").trim();
}
export function searchUniversities(value: string) {
  const words = normalizeUniversity(value).split(" ").filter(Boolean);
  return UNIVERSITIES.filter(university => words.every(word => normalizeUniversity(`${university.label} ${university.aliases}`).includes(word)));
}
export function canonicalUniversity(value: string) {
  const key = normalizeUniversity(value);
  const exact = UNIVERSITIES.find(university => normalizeUniversity(university.label) === key || university.aliases.split(" ").some(alias => normalizeUniversity(alias) === key && !["roma", "siena", "perugia", "milano", "torino", "bari"].includes(key)));
  return exact?.label || value.trim();
}
