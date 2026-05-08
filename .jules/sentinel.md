## 2026-05-03 - [Reverse Tabnabbing in target=_blank]
**Vulnerability:** Found a target="_blank" link to GitHub missing the noopener attribute in App.tsx.
**Learning:** While noreferrer was present (which implicitly adds noopener in modern browsers), explicitly adding noopener provides defense-in-depth and satisfies strict security linters against reverse tabnabbing.
**Prevention:** Always use rel="noopener noreferrer" for external links with target="_blank".

## 2026-05-07 - [Unhandled JSON Parsing of LLM Outputs]
**Vulnerability:** Unhandled JSON.parse() on responses directly from LLM services could crash the app and leak internal stack traces.
**Learning:** LLM responses are untrusted input. They can be malformed, truncated, or non-JSON content. Treating them as guaranteed JSON can lead to unhandled exceptions exposing internal mechanisms.
**Prevention:** Always wrap JSON.parse() in a try-catch block when parsing LLM or AI-generated strings, providing a safe, non-leaking fallback object or default state.
