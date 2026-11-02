---
name: Architecture view
description: A repository's architecture drawn as a transit map in Bertin's palette, where vermilion means a broken rule and nothing else.
colors:
  breach-vermilion: "#ff5a36"
  on-breach: "#1a0d08"
  breach-note-ground: "#2a130d"
  breach-note-ink: "#ffc2b3"
  tier-brick: "#d96c5b"
  tier-ochre: "#c9a227"
  tier-olive: "#9bb35a"
  tier-teal: "#5fb3a1"
  tier-slate-blue: "#6f8fc9"
  tier-violet: "#a27cc0"
  tier-stone: "#8c8a84"
  tier-sand: "#c8a07a"
  tier-rose: "#c97b9a"
  tier-moss: "#7d9c6b"
  zone-allowed: "#22301f"
  zone-condition: "#3b3319"
  zone-forbidden: "#2c1b18"
  zone-same-tier: "#262624"
  allowed-ink: "#a9cf9e"
  condition-ink: "#e2cf90"
  forbidden-ink: "#e3a597"
  added-green: "#9bd3a0"
  removed-rose: "#d79a8f"
  warning-amber: "#e8a33d"
  live-green: "#7fb38a"
  carbon-ground: "#121212"
  raised-ground: "#181818"
  source-ground: "#0e0e0e"
  hairline: "#2a2928"
  quiet-rule: "#3a3937"
  group-rule: "#4a4946"
  off-white-ink: "#ecebe6"
  soft-ink: "#bdbbb4"
  warm-grey: "#8c8a84"
  line-number-grey: "#5a5955"
  syntax-keyword: "#c6a6d8"
  syntax-string: "#b9c98f"
  syntax-comment: "#6f6d68"
typography:
  headline:
    fontFamily: "Public Sans, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 700
    letterSpacing: "-0.015em"
  title-large:
    fontFamily: "Public Sans, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Public Sans, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 700
  body:
    fontFamily: "Public Sans, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.45
    fontFeature: "tnum"
  body-small:
    fontFamily: "Public Sans, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
  label:
    fontFamily: "Public Sans, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 600
  tag:
    fontFamily: "Public Sans, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 600
  mono:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "12.5px"
    fontWeight: 400
  mono-source:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "12.5px"
    fontWeight: 400
    lineHeight: "20px"
  mono-cell:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "clamp(0px, calc(11px * var(--z)), 14px)"
    fontWeight: 600
    lineHeight: 1
rounded:
  hairline: "2px"
  tag: "3px"
  control: "4px"
  pill: "999px"
  roundel: "50%"
spacing:
  2xs: "4px"
  xs: "6px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  2xl: "24px"
  3xl: "32px"
components:
  top-bar:
    backgroundColor: "{colors.carbon-ground}"
    height: "52px"
    padding: "0 20px"
  tab:
    textColor: "{colors.warm-grey}"
    padding: "0 12px"
  tab-hover:
    textColor: "{colors.soft-ink}"
  tab-active:
    textColor: "{colors.off-white-ink}"
  count:
    backgroundColor: "{colors.hairline}"
    textColor: "{colors.soft-ink}"
    rounded: "{rounded.pill}"
    padding: "0 6px"
  count-breach:
    backgroundColor: "{colors.breach-vermilion}"
    textColor: "{colors.on-breach}"
    rounded: "{rounded.pill}"
  count-new:
    backgroundColor: "{colors.off-white-ink}"
    textColor: "{colors.carbon-ground}"
    rounded: "{rounded.pill}"
  chip:
    textColor: "{colors.soft-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "3px 9px"
  chip-hover:
    textColor: "{colors.off-white-ink}"
  tag:
    backgroundColor: "{colors.hairline}"
    textColor: "{colors.soft-ink}"
    typography: "{typography.tag}"
    rounded: "{rounded.tag}"
    padding: "1px 6px"
  tag-breach:
    backgroundColor: "{colors.breach-vermilion}"
    textColor: "{colors.on-breach}"
    typography: "{typography.tag}"
    rounded: "{rounded.tag}"
    padding: "1px 6px"
  tag-condition:
    backgroundColor: "#3a3524"
    textColor: "{colors.condition-ink}"
    typography: "{typography.tag}"
    rounded: "{rounded.tag}"
    padding: "1px 6px"
  tier-tag:
    textColor: "{colors.carbon-ground}"
    typography: "{typography.tag}"
    rounded: "{rounded.tag}"
    padding: "1px 6px"
  status-breach:
    backgroundColor: "{colors.breach-vermilion}"
    textColor: "{colors.on-breach}"
    typography: "{typography.label}"
    rounded: "{rounded.tag}"
    padding: "2px 8px"
  status-allowed:
    backgroundColor: "{colors.zone-allowed}"
    textColor: "{colors.allowed-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.tag}"
    padding: "2px 8px"
  status-condition:
    backgroundColor: "{colors.zone-condition}"
    textColor: "{colors.condition-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.tag}"
    padding: "2px 8px"
  status-forbidden:
    backgroundColor: "{colors.zone-forbidden}"
    textColor: "{colors.forbidden-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.tag}"
    padding: "2px 8px"
  module-node:
    backgroundColor: "{colors.carbon-ground}"
    textColor: "{colors.off-white-ink}"
    rounded: "{rounded.control}"
  matrix-cell-allowed:
    backgroundColor: "{colors.zone-allowed}"
    textColor: "{colors.off-white-ink}"
    typography: "{typography.mono-cell}"
    width: "calc(26px * var(--z))"
    height: "calc(24px * var(--z))"
  matrix-cell-condition:
    backgroundColor: "{colors.zone-condition}"
    textColor: "{colors.off-white-ink}"
  matrix-cell-forbidden:
    backgroundColor: "{colors.zone-forbidden}"
    textColor: "{colors.off-white-ink}"
  matrix-cell-same-tier:
    backgroundColor: "{colors.zone-same-tier}"
    textColor: "{colors.off-white-ink}"
  matrix-cell-breach:
    backgroundColor: "{colors.breach-vermilion}"
    textColor: "{colors.on-breach}"
  side-panel:
    backgroundColor: "{colors.raised-ground}"
    width: "380px"
    padding: "18px 20px 60px"
  page:
    backgroundColor: "{colors.carbon-ground}"
    padding: "24px 32px 80px"
  source-panel:
    backgroundColor: "{colors.source-ground}"
    width: "min(820px, 62vw)"
  breach-note:
    backgroundColor: "{colors.breach-note-ground}"
    textColor: "{colors.breach-note-ink}"
    typography: "{typography.body-small}"
    rounded: "{rounded.control}"
    padding: "8px 10px"
  notice:
    backgroundColor: "{colors.raised-ground}"
    textColor: "{colors.soft-ink}"
    padding: "10px 16px"
  version-warning:
    backgroundColor: "{colors.raised-ground}"
    textColor: "{colors.soft-ink}"
    typography: "{typography.body-small}"
    padding: "12px 20px 14px"
---

# Design System: Architecture view

## Overview

**Creative North Star: "The Transit Map of the Code"**

Tiers are transit lines and modules are stations. The matrix's two axes are line strips in tier order, each a solid band of its tier's colour, and each module sits on its line as a ringed roundel. The rest of the view inherits that map's discipline: a carbon ground, off-white ink, warm grey for what is secondary, hairlines for structure, and colour only where it carries a meaning the rules file defines.

The register is a technical instrument kept open beside an agent at work. It is dense, desktop only, and reads at a glance: a fixed top bar, a breadcrumb row, then a full-height view that never scrolls the page itself. The palette is Bertin's: one muted earth colour per tier, four dark zone grounds for what the rules allow, and a single loud colour, vermilion, reserved for a broken rule. The grey IDE dependency matrix with numbers in a tree is what this view refuses; so do rounded tiles, a free canvas and a plain data table, which were tried against the comp and read worse.

**Key Characteristics:**
- Dark carbon ground, flat, depth by tonal steps and hairlines.
- One colour per tier, assigned once and carried everywhere the tier appears.
- Vermilion appears only where a rule is broken.
- Public Sans for interface, JetBrains Mono for anything a machine wrote (paths, `file:line`, module ids, code, matrix counts).
- Tabular figures everywhere; small type (11 to 15px) with weight, not size, doing the hierarchy.

## Colors

A near-black ground, warm off-white ink, earth-toned tier lines, dark zone fills, and one vermilion that signals a breach.

### Primary
- **Breach Vermilion** (`breach-vermilion`): every place a rule is broken, and only those: the breach cell in the matrix, the Breaches tab count when nonzero, breach tags and status tags, the "imports" arrow of a breaching pair, the 3px bar and tint of a breaching line in the source panel, the rule name inside its note. Text set on it uses **On-Breach** (`on-breach`), a near-black brown.
- **Breach Note** (`breach-note-ground`, `breach-note-ink`): the dark red-brown block under a breaching source line carrying the rule and its fix, in a pale coral ink.

### Secondary
- **Tier lines** (`tier-brick`, `tier-ochre`, `tier-olive`, `tier-teal`, `tier-slate-blue`, `tier-violet`, `tier-stone`, `tier-sand`, `tier-rose`, `tier-moss`): one per tier, assigned in tier order and cycled when a repository has more than ten. A tier's colour is set once (as the `--c` or `--tc` custom property) and reused for its axis strip, its station roundels, its tier tags, the head of a module node, its swatch on the Rules page, and the tint of an import line pointing at it in the source panel.

### Tertiary
- **Zone fills** (`zone-allowed`, `zone-condition`, `zone-forbidden`, `zone-same-tier`): dark olive, dark ochre, dark brick and neutral charcoal, the solid fills of matrix cells and of the Rules page's tier-by-tier grid. They are grounds, never text colours.
- **Zone inks** (`allowed-ink`, `condition-ink`, `forbidden-ink`): the lighter partner of each zone, used for text on its zone (status tags) and for a condition written in words.
- **Diff green and rose** (`added-green`, `removed-rose`): what a branch or a session added and removed, as text, and as a 14% tint behind a format diff's lines. A newly added matrix cell carries a 5px added-green dot in its corner. Removed is a muted rose, deliberately far from vermilion: a removal is not a breach.
- **Warning Amber** (`warning-amber`): the view's own trouble, never the code's: the analyzer sends a format this view cannot read, or part of the view shows less than it should. It colours a square mark and a bottom border.
- **Live Green** (`live-green`): the live status dot alone, with a 3px halo of itself at low alpha.

### Neutral
- **Carbon Ground** (`carbon-ground`): the page, the top bar, sticky matrix headers, module nodes, the diagonal cells.
- **Raised Ground** (`raised-ground`): the right panel beside the matrix, notices and the version warning, a hovered row.
- **Source Ground** (`source-ground`): the source drawer, a step darker than the page so code reads as a separate sheet.
- **Hairline** (`hairline`): every 1px border and divider, and the fill of neutral counts and tags. **Quiet Rule** (`quiet-rule`) draws the scrollbar thumb and legend swatch borders; **Group Rule** (`group-rule`) draws the 3px line under a tier group's header. Cell gridlines are white at 4% alpha.
- **Off-White Ink** (`off-white-ink`): primary text, the focus ring, the active tab's underline, the selected cell's outline, the unseen marker.
- **Soft Ink** (`soft-ink`): secondary text, control labels, list rows at rest.
- **Warm Grey** (`warm-grey`): muted text, section heads, inactive tabs, empty states, separators.
- **Line-Number Grey** (`line-number-grey`) for source line numbers; **Syntax** (`syntax-keyword`, `syntax-string`, `syntax-comment`) colours the source panel's tokens, with comments in italic.

### Named Rules
**The Vermilion Is a Breach Rule.** Breach Vermilion appears only where the rules file is broken. Status, warnings, removals and the offline state use something else: the offline live dot is an ink outline, a removal is rose, a format problem is amber.

**The One Colour per Tier Rule.** A tier's colour is assigned once, in tier order, and every mark of that tier reuses it. No component picks its own tier colour.

**The Warning Is Not a Breach Rule.** Amber flags the view's own limits (a format gap, missing data), with a square mark. It never marks code.

## Typography

**Display Font:** Public Sans (with system-ui, sans-serif)
**Body Font:** Public Sans (with system-ui, sans-serif)
**Label/Mono Font:** JetBrains Mono (with ui-monospace, monospace)

**Character:** A plain, civic grotesque for everything a human reads, paired with a coding mono for everything the analyzer reads; tabular figures throughout so counts line up.

### Hierarchy
- **Headline** (700, 22px, -0.015em): the one title of a page (Breaches, Changes, Rules, a module's name).
- **Title Large** (700, 20px, -0.01em): the selected tier's name on the Rules page.
- **Title** (700, 15px): a lane's heading on a page (Imports, Against main, This session); the tool's name in the top bar, at -0.01em.
- **Body** (400, 14px, 1.45): running text, rows, explanations; prose capped at 56 to 70ch depending on the block.
- **Body Small** (400, 13px): the breadcrumb, top-bar status and stats, page facts, the reason under a status tag, notices.
- **Label** (600, 12px): section heads in sentence case and warm grey (Imports, Files, a rule's name and count), toolbar text, status tags, tier names on the axes.
- **Tag** (600, 11px): counts, tags, tier tags.
- **Mono** (400, 12.5px): paths, `file:line`, import specifiers, module ids and labels on the axes; in the source panel at a 20px line.
- **Mono Cell** (600, 11px scaled with zoom, capped at 14px): the counts inside matrix cells.

### Named Rules
**The Machine Text Rule.** Whatever the analyzer or the code produced (a path, a `file:line`, a module id, a specifier, a count in a cell) is set in JetBrains Mono; whatever the view says in words is Public Sans.

**The Weight Not Size Rule.** The interface lives between 11 and 15px; hierarchy comes from weight (400, 600, 700) and ink level (ink, soft ink, warm grey). Only page titles and the selected tier step up.

## Layout

The app is a four-row grid filling the viewport: the 52px top bar (tool, repository, branch against base as a pill, live status, tabs with their counts, stats pushed right), a notices row that is empty unless something is wrong, a 38px breadcrumb row with a Back button, then the view, which owns its scrolling. The page body never scrolls.

The Matrix tab splits into the matrix (flexible) and a 380px right panel on the raised ground. The matrix scrolls in both directions inside its own scroller, pans by dragging, and zooms from 100% to 300%: cells scale with `--z`, headers grow with it up to 125% (`--zh`). Headers and tier strips stay stuck to the top and left edges. An overview canvas sits in the bottom right corner with a draggable frame. Hovering moves a translucent row band and column band (ink at about 7% with a 18% outline) and lights both labels; cells themselves are never restyled on hover.

Other tabs are scrolling pages padded 24px by 32px, with 80px of bottom room. Two-lane pages (a module's Imports and Imported by; Changes' "Against main" and "This session") use two equal columns 32px apart. Lists are rows divided by hairlines, padded 6px (compact lists), 9px (import lines) or 12px (page rows); page rows put a 120px label column (a tag, a time, added or removed) before their content.

The source panel is a drawer pinned to the right under the top bar and breadcrumb, `min(820px, 62vw)` wide, sliding in over the view without leaving the app.

Spacing steps are 4, 6, 8, 12, 16, 20, 24 and 32px; 8px is the common gap between inline items, 16 to 32px between blocks.

## Elevation & Depth

The view is flat. Depth comes from tonal steps of the ground (source drawer darker than the page, the right panel and notices one step lighter) and from 1px hairlines. Sticky headers sit on the carbon ground at a higher stacking order rather than with a shadow.

### Shadow Vocabulary
- **Drawer shadow** (`box-shadow: -24px 0 48px #00000080`): the source panel, only while it is open. Closed, it would darken the right edge of every view.
- **Live halo** (`box-shadow: 0 0 0 3px #7fb38a22`): the ring around the live dot.
- **Selected row rules** (inset 1px ink at 33% above and below): the selected tier's row in the Rules grid.

### Named Rules
**The Flat Ground Rule.** Surfaces are flat at rest. The single cast shadow belongs to the source drawer while it is open.

## Shapes

Corners are small and functional: 4px on controls, chips, module nodes and notes; 3px on tags, status tags and tier swatches; 2px on the focus ring and token highlights; full pills only for counts and the branch. Stations are circles: a 10px roundel with a 2px ring in its tier's colour on the carbon ground (16px with a 3px ring as a module page's hero). Tier lines are bars: 5px strips along the matrix axes, 5 to 6px rounded swatches elsewhere. Marks that are not stations are square: the warning mark, the notice mark, the legend keys.

Borders are 1px hairlines; tier groups get a 3px group rule; the active tab gets a 2px ink underline; a selected cell gets a 2px ink outline drawn inside it.

## Components

### Top bar and tabs
Quiet chrome on the carbon ground with a hairline below.
- **Tabs:** 500 weight, warm grey at rest, soft ink on hover, off-white ink with a 2px ink underline when current (`aria-current`).
- **Counts:** a pill after the tab label, 11px; neutral (hairline fill, soft ink) by default, including a zero breach count; vermilion with on-breach text when breaches exist; inverted (ink fill, carbon text, 700) for unseen changes.
- **Branch:** a hairline pill, head in ink at 500, "against base" in soft ink.
- **Live status:** a 7px dot before the text. Live is live green with its halo; offline is an empty dot with a 1.5px soft-ink inset ring; a saved snapshot is a flat warm-grey dot.

### Buttons and chips
Outlined, never filled.
- **Shape:** 4px corners, 1px hairline border, transparent ground.
- **Chip** (12px, 3px by 9px, soft ink), **Back**, **Close**, **Open** (with an outward arrow icon), **Open module page**: on hover the border goes warm grey and the text goes ink. A disabled Back drops to 35% opacity.
- **Zoom control:** a hairline-bordered group of bare buttons around a percentage readout; a button hovers to ink on the raised ground.
- **Focus:** a 2px off-white outline, 2px offset, on every focusable element.

### Tags and status
- **Tag:** 11px/600, 3px corners, 1px by 6px; neutral on hairline, **breach** on vermilion, **condition** in condition ink on a dark ochre.
- **Tier tag:** the same shape, carbon text on the tier's own colour; used in lists, in a lane's linked module, and inside an analyzer message where it names a tier.
- **Status tag:** 12px/600, 2px by 8px, the pair's verdict in words (Breach, Allowed, Allowed on a condition, Forbidden), each on its zone fill with its zone ink, Breach on vermilion. It leads the right panel's pair detail.

### Module node
A module with its tier attached: a 4px, hairline-bordered capsule whose head is the tier's colour carrying the tier name (12px/600, carbon text) and whose body is the module name in mono (13px, ink). Two nodes joined by a soft-ink "imports" arrow describe a pair; the arrow turns vermilion when the pair breaches. A linked node's border goes warm grey on hover.

### Import line
A full-width row, divided by hairlines: `file:line` in soft-ink mono, then the specifier in warm-grey mono below. On hover the path turns ink and underlines (3px offset). It opens the source panel at that line.

### Matrix (signature component)
Rows import columns, both in tier order, grouped into tier groups. Each axis carries the tiers as 5px line strips with their name, and modules as roundels with their mono name; column labels run vertically. Cells are solid zone fills with hairline gridlines at 4% white and a mono count; a breach cell is vermilion with on-breach text at 700; the diagonal is carbon and inert. A selected cell is outlined in ink; a cell the branch added carries an added-green corner dot. Group, tier and module headers fold and unfold on click and highlight to ink when their row or column is hovered. A key in the toolbar names the four zones with 16px square swatches.

### Lanes and rows (pages)
A lane is a titled column: title (15px/700) with a count pill, then tier groups (a rounded tier swatch and the tier name in warm grey), then rows. On a module page each linked module is a folding row (chevron, tier tag and mono name, a breach or condition tag, the line count, an Open button); it opens by default when one of its lines breaches.

On the Changes page, the "Against main" lane opens with a vermilion `+N breach` tag on its first row, each row naming the breach's rule then its `file:line`; then added pairs in diff green and removed pairs in rose. In "This session", each change is a timed row: its files as mono links, then added and removed pairs, and for a breach a `breach: <rule>` tag followed by the analyzer's message in ink with each tier it names rendered as a tier tag. An unseen change carries a 6px ink dot in the left margin until marked as seen.

### Rules page
A compact tier-by-tier grid of 20px zone cells (allowed, condition, forbidden, same tier) with tier swatches on both axes, beside the selected tier's rule: name with its swatch, then sentence-case warm-grey heads (What belongs here, May import, Within the tier, Technologies, Paths, When it is breached). The selected row is ruled above and below in ink at a third and its head goes to 600.

### Source panel
A drawer on the source ground with a header (path in mono, a close button, a legend of the tiers the file imports, each toggleable by `aria-pressed`, dropping to 40% when off). Lines are a 52px number gutter and the code. An import line is tinted with its target tier: a 3px bar of the tier's colour (striped when it imports several) over a 12% wash; each import's name gets a 22% wash and an underline of its tier's colour. A breaching line gets a 3px vermilion bar over a faint vermilion wash and, below it, a breach note. The target line is outlined in ink at a third.

### Notices and version warning
- **Notice:** said in place of, or at the head of, a part that shows less than it should: a 9px amber square mark, a 14px ink title, 13px soft-ink explanation, on the raised ground with an amber bottom border.
- **Version warning:** a band under the top bar when the analyzer differs from the view: a 9px ink square mark with a square ring that leaves it every 1.8s, the analyzer and view versions with differing fields in ink at 600, the fix command in mono. At the graver level (a format the view cannot read) the border is amber and the mark blinks amber in steps. Both animations stop under reduced motion, leaving the mark amber.

## Do's and Don'ts

### Do:
- **Do** keep Breach Vermilion for broken rules only; give any other state its own colour (amber for the view's trouble, rose for removals, an ink outline for offline).
- **Do** take a tier's colour from the tier, through the `--c` or `--tc` property, for every mark of that tier.
- **Do** set paths, `file:line`, module ids and code in JetBrains Mono at 12.5px, and everything else in Public Sans.
- **Do** show matrix states as solid zone fills, and show hover with the moving row and column bands rather than by restyling cells.
- **Do** draw stations as ringed roundels and tiers as bars; keep other marks square.
- **Do** outline controls with a 1px hairline at 4px, and answer hover with a warm-grey border and ink text.
- **Do** separate surfaces with hairlines and ground steps; keep the drawer shadow the only cast shadow.

### Don't:
- **Don't** use vermilion for a status dot, a warning, a removal or a decorative accent.
- **Don't** fill cells or tags with a tier colour other than the tier's own.
- **Don't** add a second loud accent; the tier colours stay muted earth tones and the zones stay dark.
- **Don't** put a shadow on a surface at rest.
- **Don't** set code or paths in the sans, or interface prose in the mono.
