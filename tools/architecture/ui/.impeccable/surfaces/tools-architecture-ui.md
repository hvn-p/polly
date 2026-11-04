---
version: 1
slug: "tools-architecture-ui"
primary_target: "tools/architecture/ui"
related_targets: []
---

# Architecture view

Scope: the analyzer's view, a working app in five tabs (Matrix, Module, Breaches, Changes, Rules) and an in-app source panel. Visitor mode: Operate.

Audience and job: a developer watching an agent code in a worktree, reviewing a branch against its base, or discovering a repository. They spot a breach the moment it happens, read who depends on whom, and open the code behind any import.

Constraints: desktop only; English; every relationship shown is one the rules file enforces; tiers collapse because flows and domains keep growing.

Approved comp: `tools/architecture/ui/mockup/index.html`, an HTML composition validated in a headed browser; its `README.md` lists what the build keeps.

## Direction contract

THESIS: Tiers read as transit lines and modules as stations, so the matrix's axes are line strips in tier order; refuses the grey IDE dependency matrix with numbers in a tree.

OWN-WORLD: Bertin's palette: carbon ground #121212, off-white ink #ecebe6, warm grey #8c8a84, one muted earth colour per tier (brick, ochre, olive, teal, slate blue, violet, stone), vermilion #ff5a36 for breaches only. Hairlines, square marks, tier lines with station roundels. Public Sans for UI, JetBrains Mono for paths and code.

STORY: the visitor sees the live status and the breach count, scans the matrix, collapses the tiers they do not care about, opens a pair or a module to read its imports, and opens the source at the exact line without leaving the app.

FIRST VIEWPORT: top bar (tool, repository, branch against base, live status, counts, tabs); left the tier lines as a legend that collapses and expands tiers; centre the matrix with line-strip axes; right the selected pair's verdict in one word, its explanation and its import lines.

FORM: Network Line Diagram, candidate 3 of my ordered list, fused with Bertin's palette at the user's request. seed:64a8281f5d7f7301

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
