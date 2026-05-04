## 2026-05-03 - [Reverse Tabnabbing in target=_blank]
**Vulnerability:** Found a target="_blank" link to GitHub missing the noopener attribute in App.tsx.
**Learning:** While noreferrer was present (which implicitly adds noopener in modern browsers), explicitly adding noopener provides defense-in-depth and satisfies strict security linters against reverse tabnabbing.
**Prevention:** Always use rel="noopener noreferrer" for external links with target="_blank".
