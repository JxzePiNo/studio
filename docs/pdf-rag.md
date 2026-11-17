# PDF retrieval for chat

The server uses OpenAI Vector Stores search before generating each chat answer.
There is no client-controlled vector store identifier. Document authorization
precedes reading bytes or searching; an exam search re-authorizes each document.

On first use the full PDF text is extracted with PDF.js, retaining physical page
numbers. Unlike the old lexical index, extraction does not stop at 2 million
characters. A 40 million character resource limit fails explicitly rather than
silently omitting later pages. Image-only scans require OCR and are not indexed.
No user annotations, conversations, document titles or course names enter the index.

The application uploads one UTF-8 text file with repeated physical page markers.
OpenAI handles chunking (800 tokens, overlap 150), embedding and vector storage.
This avoids uploading a thousand separate page files and preserves page references.
Retrieved excerpts are checked against the source page before use; lexical search
adds exact-term matches. Text retained for citation verification is shared by hash
and persisted in private application storage.

Registry identity includes SHA-256 of the original PDF, index format and a hash of
the OpenAI configuration. Renamed identical documents reuse the same index.
Firestore transaction leases/local lock files prevent concurrent indexing; file
and vector store IDs are checkpointed so retries resume after interruption.

The three highest-ranked chunks select the original pages sent to the answer
model. Duplicate pages are removed, so at most three original pages are attached,
including full page text and the PDF pages with their visual content. A manifest
maps attachment page numbers to physical source page numbers, including across
multiple documents. Full-page text above 180,000 characters fails explicitly.
Normal chat with no searchable text attaches only the current
page; strict PDF mode abstains without verifiable retrieved text. No chat fallback
attaches the entire PDF. Explicit quiz/material generation remains a separate flow.
Exam searches cover at most 20 authorized documents and disclose this limit.
Strict answers require literal citations in the supplied full pages and support >=0.5;
this is a heuristic support rating, not calibrated accuracy.
The model selects server-generated source IDs through a constrained schema. The
server binds these IDs to exact original text and physical pages, avoiding errors
from model-transcribed formulas or attachment-local page numbers. Citation/schema
failures allow one bounded correction and are reported separately from missing
documentary information.

OpenAI resources have bounded retention: vector stores expire after seven days of
inactivity; source files expire after 30 days. Missing/expired resources are rebuilt
on demand. Shared indexes can outlive an individual library entry during this
retention window. No persistent background worker is required. First use can take
longer; a 409 while indexing asks the user to retry and retains provider progress.

Uses the existing OPENAI_API_KEY, with optional OPENAI_PROJECT_ID/OPENAI_ORG_ID.
No external vector database is needed. Model usage continues through meteredFetch.
OpenAI storage billing is account-wide and is not returned as per-request token
usage. A monthly per-user rag-storage usage event records observed index bytes and
marks cost reports incomplete instead of incorrectly treating storage as free or
allocating the account-wide free tier arbitrarily. Shared storage billing is not
an exact per-user charge.

References:
- https://developers.openai.com/api/docs/guides/retrieval
- https://developers.openai.com/api/docs/pricing

Tests mock the OpenAI storage/search API and do not create paid provider resources.
