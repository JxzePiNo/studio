import type { Firestore } from "@google-cloud/firestore";

/** Small deterministic Firestore substitute for authorization/transaction tests. */
export function memoryFirestore() {
  type Value = Record<string, any>;
  let records = new Map<string, Value>();
  let queue = Promise.resolve();
  const snap = (path: string, source = records): any => ({ id: path.split("/").at(-1)!, exists: source.has(path), ref: reference(path), data: () => structuredClone(source.get(path)), get: (field: string) => source.get(path)?.[field] });
  function reference(path: string): any {
    return { path, id: path.split("/").at(-1), firestore: db, parent: collection(path.split("/").slice(0, -1).join("/")), collection: (name: string) => collection(`${path}/${name}`), get: async () => snap(path), set: async (value: Value, options?: { merge: boolean }) => { records.set(path, structuredClone(options?.merge ? { ...records.get(path), ...value } : value)); }, update: async (value: Value) => { records.set(path, { ...records.get(path), ...structuredClone(value) }); }, delete: async () => { records.delete(path); } };
  }
  function collection(path: string, filters: [string, string, any][] = [], maximum = Infinity, sort?: [string, string]): any {
    return { path, parent: path.includes("/") ? reference(path.split("/").slice(0, -1).join("/")) : null, doc: (id: string) => reference(`${path}/${id}`), where: (field: string, op: string, value: any) => collection(path, [...filters, [field, op, value]], maximum, sort), limit: (value: number) => collection(path, filters, value, sort), select: () => collection(path, filters, maximum, sort),
      orderBy: (field: string, direction: string) => collection(path, filters, maximum, [field, direction]), get: async () => query(path, filters, maximum, records, sort), _query: (source: Map<string, Value>) => query(path, filters, maximum, source, sort) };
  }
  function query(path: string, filters: [string, string, any][], maximum: number, source = records, sort?: [string, string]) {
    const docs = [...source.entries()].filter(([key, value]) => key.startsWith(`${path}/`) && key.slice(path.length + 1).indexOf("/") === -1 && filters.every(([field, op, expected]) => op === "==" ? value[field] === expected : op === "array-contains" ? value[field]?.includes(expected) : op === ">=" ? value[field] >= expected : op === "<=" ? value[field] <= expected : op === "<" ? value[field] < expected : false)).slice(0, maximum).map(([key]) => snap(key, source));
    if (sort) docs.sort((a, b) => String(a.get(sort[0])).localeCompare(String(b.get(sort[0]))) * (sort[1] === "desc" ? -1 : 1));
    return { docs, size: docs.length, empty: !docs.length };
  }
  const db: any = { collection, recursiveDelete: async (ref: any) => { for (const key of records.keys()) if (key === ref.path || key.startsWith(`${ref.path}/`)) records.delete(key); }, getAll: async (...refs: any[]) => refs.map(ref => snap(ref.path)), runTransaction: (run: (tx: any) => Promise<unknown>) => {
    const task = queue.catch(() => {}).then(async () => {
      const next = structuredClone(records);
      const result = await run({ get: async (ref: any) => ref._query ? ref._query(next) : snap(ref.path, next), getAll: async (...refs: any[]) => refs.map(ref => snap(ref.path, next)), set: (ref: any, value: Value, options?: { merge: boolean }) => next.set(ref.path, structuredClone(options?.merge ? { ...next.get(ref.path), ...value } : value)), update: (ref: any, value: Value) => next.set(ref.path, { ...next.get(ref.path), ...structuredClone(value) }), delete: (ref: any) => next.delete(ref.path) });
      records = next; return result;
    });
    queue = task.then(() => {}, () => {}); return task;
  } };
  return db as Firestore;
}
