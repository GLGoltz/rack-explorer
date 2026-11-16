# Network Diagram

A small web app where each Cyber Hub team records the network it has built on its rack, then shares it as a link.
Live at https://glgoltz.github.io/rack-explorer/diagram/

- Build: `node diagram/build.mjs` writes `diagram/index.html` from `diagram/src/`.
- Saving: the diagram autosaves in the browser. "Copy share link" puts the whole diagram in the link, which is the
  real save. Nothing is sent to a server.
- Hard rule: the app ships no rack plan, expected values or answers. Everything shown comes from what the team typed.
  The full spec is `DIAGRAM_APP_SPEC.md` in the Cyber Hub source.

Version 1: drawing, list view, undo, browser save, share links, JSON backup, PNG export, print.
Version 2 (planned): consistency checks, packet trace, instructor comparison.
