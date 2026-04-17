# Monkai — Claude Code Instructions

## Artifact Naming & Placement

Planning and implementation artifacts must always go in a **phase-specific subfolder** — never directly under the top-level artifacts directory.

### Planning artifacts

Path: `_bmad-output/planning-artifacts/phase-{N}-{slug}/`

File naming:
- `prd-{slug}.md`
- `architecture-{slug}.md`
- `epics-{slug}.md`

Existing phases:
| Folder | Contents |
|---|---|
| `phase-1-crawler` | Phase 1 crawler PRD, architecture, epics |
| `phase-1-1-vnthuquan-crawler` | vnthuquan crawler PRD, architecture, epics |
| `phase-2-reader-ui` | Reader UI PRD, architecture, epics, UX spec |
| `phase-2-5-epub-js` | epub.js integration PRD, architecture, epics |
| `phase-3-multi-source` | Multi-source library UI + reading PRD |

### Implementation artifacts

Path: `_bmad-output/implementation-artifacts/` (flat — story files + `sprint-status.yaml`)

### Note for bmad workflows

The bmad `create-prd` and similar workflows default to writing at the top-level artifacts path. Always move/rename the output into the correct phase subfolder immediately after generation.
