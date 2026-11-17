/** Mock only OpenAI's storage/retrieval API; model requests use the supplied handler. */
export function ragProvider() {
  const files = new Map<string, string>(), stores = new Map<string, string>();
  const calls: { url: string; body?: any }[] = [];
  let serial = 0;
  return { files, stores, calls, wrap: (model: typeof fetch): typeof fetch => async (url, init) => {
    const address = String(url);
    if (address.endsWith("/responses")) return model(url, init);
    let body: any;
    if (typeof init?.body === "string") body = JSON.parse(init.body);
    calls.push({ url: address, body });
    if (address.endsWith("/files") && init?.method === "POST") {
      const file = (init.body as FormData).get("file") as File;
      const id = `file_${++serial}`; files.set(id, await file.text());
      return Response.json({ id });
    }
    if (address.endsWith("/vector_stores") && init?.method === "POST") {
      const id = `vs_${++serial}`; stores.set(id, body.file_ids[0]);
      return Response.json({ id });
    }
    const search = address.match(/\/vector_stores\/(vs_\d+)\/search$/);
    if (search) {
      const fileId = stores.get(search[1]);
      if (!fileId) return Response.json({ error: { message: "Missing" } }, { status: 404 });
      return Response.json({ object: "vector_store.search_results.page", data: [{ file_id: fileId, score: 0.9, filename: "materiale.txt", content: [{ type: "text", text: files.get(fileId) }] }], has_more: false });
    }
    const store = address.match(/\/vector_stores\/(vs_\d+)$/);
    if (store) {
      if (init?.method === "DELETE") { stores.delete(store[1]); return Response.json({ id: store[1], deleted: true }); }
      if (!stores.has(store[1])) return Response.json({ error: { message: "Missing" } }, { status: 404 });
      return Response.json({ id: store[1], status: "completed", file_counts: { completed: 1, failed: 0, cancelled: 0 }, usage_bytes: 1024 });
    }
    if (/\/files\/file_\d+$/.test(address) && init?.method === "DELETE") return Response.json({ deleted: true });
    throw new Error(`Unexpected RAG request: ${init?.method} ${address}`);
  } };
}
