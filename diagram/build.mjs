// Network Diagram app: build script.
//
//   node diagram/build.mjs    writes diagram/index.html
//
// src/shell.html   page layout
// src/style.css    styles, including the styles copied into PNG exports
// src/app.js       everything interactive
//
// The app ships no rack plan, answers or expected values. See DIAGRAM_APP_SPEC.md, section 2.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const HERE = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(HERE, p), "utf8");
const css = read("src/style.css");
const html = read("src/shell.html")
  .replace("{{CSS}}", () => css)
  .replace("{{JS}}", () => read("src/app.js"));
writeFileSync(join(HERE, "index.html"), html);
console.log("diagram/index.html", html.length, "bytes");
