// Build script — js/ + css/ + index.html'i tek bir standalone/index.html
// içine inline'lar. JS koruması olan ortak alanlara koyabilmek için.
//
// Çalıştır: node build-standalone.js

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const OUT_DIR = path.join(ROOT, 'standalone');
const OUT_FILE = path.join(OUT_DIR, 'index.html');

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'css', 'styles.css'), 'utf8');

const JS_ORDER = ['parse', 'patterns', 'analysis', 'triage', 'markdown', 'main'];
const jsBlocks = JS_ORDER
  .map((n) => `// === js/${n}.js ===\n${fs.readFileSync(path.join(ROOT, 'js', `${n}.js`), 'utf8')}`)
  .join('\n\n');

// Function replacer kullan — replacement string'inde $ karakteri özel
// olarak yorumlanmasın ($' = "match sonrası", $$ = literal $ vb.).
// Kaynak kodda '$' literal'leri var (mutlak hücre referansı için).
const bundled = html
  .replace(
    '<link rel="stylesheet" href="css/styles.css">',
    () => `<style>\n${css}\n</style>`
  )
  .replace(
    /  <script src="js\/parse\.js"><\/script>\s*\n\s*<script src="js\/patterns\.js"><\/script>\s*\n\s*<script src="js\/analysis\.js"><\/script>\s*\n\s*<script src="js\/triage\.js"><\/script>\s*\n\s*<script src="js\/markdown\.js"><\/script>\s*\n\s*<script src="js\/main\.js"><\/script>/,
    () => `  <script>\n${jsBlocks}\n  </script>`
  );

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT_FILE, bundled);

const size = (fs.statSync(OUT_FILE).size / 1024).toFixed(1);
console.log(`✓ ${OUT_FILE} (${size} KB)`);
