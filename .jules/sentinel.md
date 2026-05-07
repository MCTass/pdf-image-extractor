## 2026-05-03 - [Reverse Tabnabbing in target=_blank]
**Vulnerability:** Found a target="_blank" link to GitHub missing the noopener attribute in App.tsx.
**Learning:** While noreferrer was present (which implicitly adds noopener in modern browsers), explicitly adding noopener provides defense-in-depth and satisfies strict security linters against reverse tabnabbing.
**Prevention:** Always use rel="noopener noreferrer" for external links with target="_blank".
## 2026-05-05 - [Missing try-catch around JSON.parse for LLM Responses]
**Vulnerability:** Found an unhandled JSON.parse on result.text from Gemini AI response in services/geminiService.ts.
**Learning:** LLM responses are inherently untrusted and unformatted text. Directly calling JSON.parse can throw SyntaxErrors which cause unhandled exceptions, potentially crashing the application or exposing error stack traces.
**Prevention:** Always wrap JSON.parse on third-party API/LLM responses within a try-catch block and provide safe fallback values.
