# Architecture view mockup

`index.html` is the composition validated with Pierre for the architecture view (T091).
It is the reference T092 builds in React: open it in a browser, it is self-contained.
Its data is a snapshot of `architecture json` on this repository; the breach on
`flows/start-lesson → database`, the changes against main and the session history are
examples. The product and the direction behind it are in `../PRODUCT.md` and
`../.impeccable/surfaces/tools-architecture-ui.md`.

## What the build keeps

- **World**: Network Line Diagram (tiers as coloured lines, modules as stations, both
  axes drawn as line strips) in Bertin's palette on a dark ground; a technical tool's
  register, no marketing-style headings.
- **Tabs**: Matrix, Breaches, Changes, Rules; every view has its URL. A breadcrumb trail
  of the views visited, each step clickable, and a Back button.
- **Matrix**:
  - three fold levels, group, tier, module, folded and unfolded by clicking their header
    in the matrix itself; only the `server` group is unfolded by default;
  - zones as solid fills: allowed `#22301f`, on a condition `#3b3319`, forbidden
    `#2c1b18`, same tier `#262624`, breach vermilion `#ff5a36`;
  - hover moves two bands (row and column) and lights both labels, never restyling
    cells; pair counts are computed once;
  - the wheel scrolls; Ctrl or Cmd with the wheel, or a pinch, zooms around the pointer;
    dragging pans; zoom from 100% to 300%, headers grow with it up to +25%; headers stay
    stuck to the edges; a fixed overview in a corner, its frame draggable.
- **Right panel**: a cell shows the status tag, its reason, then the relation (each
  module with its tier attached, an "imports" arrow), then the import lines. A module
  name shows that module (imports and imported by, tier attached to each name) without
  leaving the matrix; "Open module page" goes to its page.
- **Module page**: each linked module is a row that folds its import lines (chevron); an
  "Open" button at the row's end goes to that module's page.
- **Rules page**: a tier-by-tier matrix of who may import whom, and the selected tier's
  rule: what belongs here, may import (conditions in words), within the tier,
  technologies, paths and the modules they make, what to do when breached.
- **Source panel**: any `file:line` opens the file in the app, each import line tinted
  with its target tier and linked to it, a breaching line annotated with rule and fix.

## What the analyzer must add

- Serving a file's content, limited to the files it analyzed (the source panel).
- A history of the session's changes kept server side, so it survives a reload (the
  Changes tab).

## Tried and rejected

Rounded tiles, a Figma-like canvas and a clean data table: none read better than this
table.
