# Local page filtering

Before a new page analysis, the server inspects the extracted single-page PDF
with PDF.js. This uses local CPU and no API tokens. It does not scan the entire
document for every request.

The conservative rules recognize genuinely empty pages, one or two large lines
of title text, and explicit tables of contents with at least three entries ending
in page numbers. Small page numbers in the bottom margin are ignored. Index and
title text remain available in the original PDF and retrieval index.

Pages containing images and no extractable text now use local Tesseract OCR.
English and Italian language data and the WASM engine are packaged with the app;
no document data or OCR requests are sent to an external service, and no language
files are downloaded at runtime. A raster up to 1600 pixels on its longest side
limits work. The OCR proposal is accepted only for high-confidence text with
conservative title/index layout, or a genuinely blank raster. Every recognized
word has a bounding box: remaining visible ink vetoes exclusion, except thin
horizontal decoration and a solid band behind an explicit index heading. This
keeps unrecognized formulas, diagrams, logos and handwriting in normal analysis.
Before initializing recognition, a raster-density check bypasses OCR on dense text
and large continuous illustrations. This can retain more pages for analysis but
cannot itself exclude a page.

One OCR worker per server process serializes work, accepts at most 16 outstanding
pages, limits queue age to 20 seconds and active work to 12 seconds, and releases
the worker after two idle seconds. Pressure, timeouts and OCR errors fall through
to model analysis. Set `LOCAL_PAGE_OCR=false` to disable OCR. Annotations, uncertain
native drawing operations, mixed native-text/image pages and extraction failures
also fall through. No additional model classifier is called for uncertain pages.
Decorative graphics can prevent a cover from being skipped; this favors retaining
useful content. OCR confidence and pixel rules are heuristics, not accuracy guarantees.

Local classifications are saved as short explanations in the existing per-page
state and shared analysis cache, preserving notes, chat and reading progress.
Blank pages have their own label. Existing analyses are reused. Explicit
regeneration bypasses the local filter and cache so users can override a decision.
Recognized pages work even without an OpenAI key; normal analysis still requires it.

Savings depend on how many pages qualify. The filter eliminates the entire model
call for those pages; it does not reduce tokens on content pages. There is no OCR
API charge or paid classification step. Rendering and OCR consume server CPU,
memory and execution time, so infrastructure costs remain.

The initial text-only filter skipped none of a 67-page image-based lecture PDF.
The final OCR path skipped its index and five section separators (6/67); all six
were visually checked. Its cover with a logo and its formulas/graphs were retained.
A raster precheck avoided recognition on 56 pages, leaving 11 OCR jobs; the local
sequential evaluation took about 40 seconds. This is one document, not a general
accuracy benchmark or a measured cost reduction. Absence of extracted text is
never sufficient to declare a page blank.
