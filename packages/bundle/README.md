# @aiwork/dsh-knowledge-graph

DSH bundle: turn one article into a knowledge graph with the selected default model, then view and edit it.

| Half | Output | What it is |
|------|--------|------------|
| Host | `dist/index.js` | SQLite article library, `graph__*` tools, `/api/kg/*` |
| Client | `dist/client.js` | Sidebar panel **Smart Graph** |
| Skill | `skill/SKILL.md` | Agent instructions |

Support site: <https://www.futureeditor.com>

Install **this package** (`packages/bundle`), not the repository root. The root is a private workspace and declares no `dsh.bundle`.

```bash
dsh plugin install link:/absolute/path/aiwork-editor-knowledgegraph/packages/bundle --profile <name>
```

The published tree includes `dist/`. After source changes, run `node build.mjs` in this directory and reload the profile.

Build uses the model selected in settings. **Build with AI** writes the graph into the profile library. **Save graph** enables only after a node name or the JSON changes. Dragging nodes does not.

This package is `private`. Install it with the link above. It is not published to the public npm registry.

Data directory: `<profile>/kg-workshop/library.sqlite`.
