# Third-party skills

Skills copied into this folder from public repositories. They run with the
agent's permissions, so they are reviewed before they enter the repository and
are changed only through a Lane B pull request (see `AGENTS.md`). `AGENTS.md`,
`docs/DESIGN.md`, `docs/RULES.md` and the `stylora-*` skills win over anything
in them.

## Anti-Slop

- Source: https://github.com/miqdadbadjuber/Anti-Slop at commit
  `9504989f162a92b1996853eccbb3d8a86e73df68`, release 3.2.26.
- License: MIT, Copyright (c) 2026 Miqdad Badjuber (antislop). Full text below.
- Copied: `antislop` (core, from `skills/antislop`), `antislop-code`,
  `antislop-copywriting`, `antislop-ui` with its `references/` and
  `LICENSE-web-quality-skills` (MIT, Copyright (c) 2026 Addy Osmani).
- Not copied: the installer CLI, plugin manifests for other tools, `antislop-human`
  (ships Python and an MCP launcher), `antislop-layoutmobile`, repository
  scripts. Do not run `npx antislop-ai` or any installer.
- Local changes, all in `antislop/SKILL.md`: the upstream sections "Already
  installed, and the user asks how to update" and "Two Usage Modes" are replaced
  by "Stylora mode (local change)", and one header line about mode resolution is
  reworded. Reason: upstream asks the user to pick a mode and waits for the
  answer, reads and writes a settings file outside the repository, writes audit
  files, and tells the agent to run `npx` updaters. Those behaviors block an
  autonomous, fast delivery lane. Everything else is byte-identical to upstream.
- Update procedure: fetch the new release, re-apply the local section, review the
  diff, update the commit and release above.

## Vercel agent skills

- Source: https://github.com/vercel-labs/agent-skills at commit
  `1a2c79d4e6c4a2283dc2c614b6538cbe1ed5ca62`.
- License: the repository has no LICENSE file at that commit; each copied
  `SKILL.md` declares `license: MIT` in its frontmatter and names Vercel as the
  author. Replace this note if an explicit LICENSE file appears upstream.
- Copied: `vercel-react-best-practices` (`SKILL.md` and `rules/`) and
  `vercel-composition-patterns` (`SKILL.md` and `rules/`).
- Local changes: a "Stylora notes (local addition)" section at the end of both
  `SKILL.md` files (no login, no new dependency for a pattern, Server Components
  first, `after()` is not durable work), and the dangling pointer to the compiled
  `AGENTS.md` in the React skill now points to `rules/`. The compiled `AGENTS.md`,
  `README.md` and `metadata.json` are not copied.
- Not copied, on purpose:
  - `web-design-guidelines` fetches its rules at run time from a URL on the
    upstream `main` branch, so its instructions can change after review.
  - `deploy-to-vercel` and `vercel-cli-with-tokens` deploy and handle tokens,
    which `AGENTS.md` does not allow without task authorization.
  - `vercel-optimize` needs a Vercel account and metrics access.
  - `react-native-skills`, `react-view-transitions` and `writing-guidelines` do
    not match current scope.
- Review depth: the two `SKILL.md` files were read in full. The 72 rule files were
  scanned for commands, network fetches and instruction-like text rather than read
  line by line; they contain only guidance, code examples and documentation links.

## MIT License text, Anti-Slop

```
MIT License

Copyright (c) 2026 Miqdad Badjuber (antislop)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
