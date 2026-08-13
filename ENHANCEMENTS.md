# Ideas I haven't built yet

Things worth doing at some point, with enough detail that I don't have to reconstruct the
reasoning later. Nothing here is committed to, it's a parking lot.

---

## Quietly refresh a live week

**Status:** deliberately shelved.

Right now scores only update when the page is loaded or when the Refresh button is hit. On
a Sunday afternoon that means sitting on the page shows frozen numbers until I do
something about it.

The idea was to re-pull every couple of minutes while the week being viewed is actually
live, and also when the browser tab regains focus. A finished season would never poll, so
it costs nothing out of season.

I decided against it for now because refreshing manually is fine and I'd rather not have
the page making requests I didn't ask for. **Of the two halves, the tab-focus refresh is
the more appealing one.** Coming back to a tab and seeing current numbers feels right, and
it doesn't poll on a timer.

Revisit during the season if manually refreshing gets annoying.

---

## Custom league branding in the config

The app currently shows a football emoji and the amber accent color for everybody. Since
the code is generic enough that another league could use it, the league-specific look
should come out of `league.config.json` rather than being baked in.

Rough shape:

```json
"branding": {
  "logo": "logo.svg",
  "accentColor": "#f2a93b"
}
```

Images would go in `public/`, which already gets copied into the build. The accent color
can be pushed into the CSS custom property at runtime. Both should fall back to what's
there now if a config doesn't set them.

---

## Split the templates and styles out of the components

Every component keeps its HTML and CSS inline in the `.ts` file. `weekly.component.ts` is
around 350 lines and most of it is CSS, which makes finding the actual logic annoying.

Angular supports `templateUrl` and `styleUrl` pointing at separate `.html` and `.css`
files. Purely a move, no behavior change, but it touches every component so it's worth
doing on its own rather than mixed in with real changes.

---


## Archive the older seasons

`src/seasons/2023.json` exists as a worked example. The other finished seasons (2022, 2024,
2025) could be exported the same way from the Settings page.

Not urgent, since the API still serves them fine. The point of doing it is insurance
against Sleeper eventually limiting how far back you can request.
