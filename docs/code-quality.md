# Code quality

This project adopts selected practices from [Google's code-review guidance](https://google.github.io/eng-practices/review/reviewer/looking-for.html)
and [Meta's published approach to testing and static analysis](https://engineering.fb.com/2023/06/27/developer-tools/meta-developer-tools-open-source/).
These are project rules, not certification against either company's internal standards.

## Runtime and design

- Ship ES5-compatible JavaScript and bundled assets. Modern JavaScript is allowed in development tools. ESLint's `ecmaVersion: 5` checks the runtime grammar; API availability still requires device evidence.
- Use strict equality, declared names and explicit error handling. The lint configuration rejects undefined/unused code, duplicate keys/arguments, unreachable statements and dynamic evaluation.
- Keep device calls in `app/device.js`, app identities/branding in `app/assets/apps/catalog.js`, and rendering/interaction in `app/main.js`. Add abstractions for existing shared responsibilities, not hypothetical future features.
- Explain non-obvious constraints in comments. Use descriptive names for new code. Keep formatting-only changes separate from behavioral changes.
- Cache expensive measurements and immutable content, but invalidate caches when their inputs change. Keep image analysis and optical rendering in offline development tools.

## Validation and privacy

Run `npm run check` for lint, catalogue/asset validation and Python regression tests. For behavior changes also run the public-font browser suite. Rendering optimizations need a before/after browser performance comparison. Test failures and delayed callbacks as well as success paths; tests must fail against the original bug.

The shared source policy is applied by the Git guard and archive writer. The guard scans working files, actual index blobs and blobs in reachable committed trees, including deleted files. It uses NUL-delimited Git records and batches object reads. Matching bytes stay out of diagnostics. New credential patterns need constructed dummy fixtures, never real credentials.

Pin development dependencies in the lockfile. Keep tooling out of the widget. CI runs `npm ci`, `npm run check`, the source guard, browser tests and a public-font export. Hooks are an additional local safeguard and must be enabled with `git config core.hooksPath .githooks`; checks are deliberately bounded and do not replace review.

Update documentation when build/configuration behavior changes. Preserve saved preferences, remote focus, stable installation identity and certificate continuity. Browser work does not authorize TV access; announce any separately authorized installation or launch and obtain the owner's visible result.
