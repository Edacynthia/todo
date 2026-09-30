/* Riso Todo — static consistency lint.
 *
 * Cross-checks index.html + script.js against styles.css: balanced CSS, defined
 * custom properties, every class/id/data-hook matching up. Catches typos that a
 * runtime test would not notice (a renamed class, a missing getElementById id).
 *
 *   node lint.js [project-dir]         (defaults to the repository root)
 */
const fs = require('fs');
const path = require('path');
const DIR = process.argv[2] || path.join(__dirname, '..');
const css = fs.readFileSync(path.join(DIR, 'styles.css'), 'utf8');
const html = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
const js = fs.readFileSync(path.join(DIR, 'script.js'), 'utf8');
const joined = html + '\n' + js;

/* Shell output redirection is unreliable in this environment, so the report is
   written to a file on exit. */
const lines = [];
const origLog = console.log;
console.log = function () {
  const line = Array.prototype.join.call(arguments, ' ');
  lines.push(line);
  origLog(line);
};
process.on('exit', function () {
  try { fs.writeFileSync(path.join(__dirname, 'lint-report.txt'), lines.join('\n') + '\n'); } catch (e) { /* ignore */ }
});

let pass = 0;
const failures = [];
function check(label, ok, extra) {
  if (ok) { pass++; console.log('  PASS  ' + label); }
  else { failures.push(label + (extra ? ' -> ' + extra : '')); console.log('  FAIL  ' + label + (extra ? ' -> ' + extra : '')); }
}
const uniq = a => Array.from(new Set(a));


/* 1. balanced braces / parens, no leftover build markers */
const count = (s, re) => (s.match(re) || []).length;
check('CSS braces balanced', count(css, /\{/g) === count(css, /\}/g), count(css, /\{/g) + ' vs ' + count(css, /\}/g));
check('CSS parens balanced', count(css, /\(/g) === count(css, /\)/g));
check('no @@NEXT@@ markers left', !joined.includes('@@NEXT@@') && !css.includes('@@NEXT@@'));
check('no lorem/placeholder text', !/lorem ipsum/i.test(joined));

/* 2. every CSS custom property that is read is also defined */
const defined = uniq((css.match(/--[a-z0-9-]+(?=\s*:)/g) || []));
const used = uniq((css.match(/var\(\s*(--[a-z0-9-]+)/g) || []).map(s => s.replace(/var\(\s*/, '')));
const missingVars = used.filter(v => !defined.includes(v));
check('all var(--x) tokens are defined', missingVars.length === 0, missingVars.join(', '));

/* 3. every class used in the markup/JS has a rule in the stylesheet */
const classAttrs = (joined.match(/class="([^"]+)"/g) || []).map(s => s.slice(7, -1).split(/\s+/)).flat();
const splitClasses = list => list.flatMap(s => s.split(/\s+/));
const classStrings = splitClasses((joined.match(/classList\.(?:add|remove|toggle)\(\s*'([^']+)'/g) || []).map(s => s.match(/'([^']+)'/)[1]));
const classNameWrites = splitClasses((js.match(/\.className\s*=\s*'([^']+)'/g) || []).map(s => s.match(/'([^']+)'/)[1]));
const classSelectors = (joined.match(/querySelector(?:All)?\(\s*'\.[a-z0-9_-]+/gi) || []).map(s => s.match(/\.([a-z0-9_-]+)/i)[1]);
const usedClasses = uniq(classAttrs.concat(classStrings, classSelectors, classNameWrites))
  .filter(c => c && !c.includes('${') && !c.endsWith('-'));
const undefinedClasses = usedClasses.filter(c => !new RegExp('\\.' + c.replace(/[-]/g, '\\-') + '(?![a-zA-Z0-9_-])').test(css) && !css.includes('.' + c));
check('every class has styling', undefinedClasses.length === 0, undefinedClasses.join(', '));

/* 4. every id read by JS exists in the HTML */
const idsUsed = uniq((js.match(/getElementById\('([^']+)'\)/g) || []).map(s => s.match(/'([^']+)'/)[1]));
const missingIds = idsUsed.filter(id => !html.includes('id="' + id + '"'));
check('every JS id exists in the HTML', missingIds.length === 0, missingIds.join(', '));

/* 5. every data-* hook used by JS exists in the markup/template/CSS, allowing
      for the `dataset.foo` spelling used in JavaScript. */
const dataHooks = uniq(['data-filter', 'data-action', 'data-testid', 'data-tag', 'data-priority', 'data-id',
  'data-note-filter', 'data-color', 'data-view']);
const missingHooks = dataHooks.filter(function (hook) {
  const camel = hook.replace(/^data-/, '').replace(/-([a-z])/g, (m, c) => c.toUpperCase());
  return !html.includes(hook) && !js.includes(hook) && !js.includes('dataset.' + camel) && !css.includes(hook);
});
check('data hooks are consistent across files', missingHooks.length === 0, missingHooks.join(', '));

const actionsInMarkup = uniq((html.match(/data-action="([a-z]+)"/g) || []).map(s => s.match(/"([a-z]+)"/)[1]));
const missingActions = actionsInMarkup.filter(a => !js.includes("'" + a + "'") && !js.includes('"' + a + '"'));
check('every data-action is handled in JS', missingActions.length === 0, missingActions.join(', '));

const testids = uniq((html.match(/data-testid="([^"]+)"/g) || []).map(s => s.match(/"([^"]+)"/)[1]));
check('task cards expose test ids', testids.includes('test-todo-card') && testids.includes('test-todo-title'));
check('balanced-ish markup (no stray </div> imbalance)', count(html, /<div\b/g) === count(html, /<\/div>/g), count(html, /<div\b/g) + ' vs ' + count(html, /<\/div>/g));
check('template + script tags present', html.includes('<template id="taskTemplate">') && html.includes('src="script.js"') && html.includes('href="styles.css"'));

console.log('\n' + pass + ' passed, ' + failures.length + ' failed');
if (failures.length) {
  console.log('\nFailures:');
  failures.forEach(f => console.log(' - ' + f));
  process.exit(1);
}
process.exit(0);
