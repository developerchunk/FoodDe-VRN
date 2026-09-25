/**
 * Nothing secret may reach the browser bundle.
 *
 *   npm run check:bundle        (run after npm run build)
 *
 * Anything prefixed VITE_ is compiled into dist/ by design — that is how the
 * browser gets the Supabase URL and publishable key, and both are meant to be
 * public. The danger is the opposite mistake: giving a genuinely secret value a
 * VITE_ prefix, or hardcoding one. A single `VITE_SUPABASE_SECRET_KEY` would
 * put a key that bypasses every RLS policy into a file anyone can read.
 *
 * So: every variable in .env whose name is NOT VITE_-prefixed is treated as a
 * secret and must be absent from the build, plus a list of shapes that are
 * always secret whatever they are called.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const DIST = "dist";
if (!existsSync(DIST)) {
  console.error("No dist/ — run `npm run build` first.");
  process.exit(1);
}

/* Shapes that are secret regardless of the variable name they arrived under. */
const ALWAYS_SECRET = [
  [/sb_secret_[A-Za-z0-9_-]{8,}/, "Supabase secret key (sb_secret_…)"],
  [/service_role/, "the service_role name"],
  [/\brzp_live_[A-Za-z0-9]+/, "a live Razorpay key id"],
  [/EAA[A-Za-z0-9]{40,}/, "a Meta/WhatsApp access token"],
  [/-----BEGIN (RSA |EC )?PRIVATE KEY-----/, "a private key"],
];

/* Every non-VITE_ variable in .env is, by definition, not meant to ship. */
const secretsFromEnv = [];
if (existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
    if (!m) continue;
    const [, name, rawValue] = m;
    const value = rawValue.replace(/^["']|["']$/g, "");
    if (!name.startsWith("VITE_") && value.length >= 8)
      secretsFromEnv.push({ name, value });
  }
}

const files = [];
const walk = (dir) => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full);
    else if (/\.(js|css|html|map|json)$/.test(entry)) files.push(full);
  }
};
walk(DIST);

const findings = [];
for (const file of files) {
  const text = readFileSync(file, "utf8");
  for (const [re, label] of ALWAYS_SECRET)
    if (re.test(text)) findings.push(`${file}: contains ${label}`);
  for (const { name, value } of secretsFromEnv)
    if (text.includes(value))
      findings.push(`${file}: contains the value of ${name}, which is not VITE_-prefixed`);
}

console.log(`\nScanned ${files.length} built file(s) in ${DIST}/\n`);
console.log(
  `  ${secretsFromEnv.length} non-VITE_ variable(s) in .env treated as secret` +
    (secretsFromEnv.length ? `: ${secretsFromEnv.map((s) => s.name).join(", ")}` : ""),
);

if (!findings.length) {
  console.log("  No secret material found in the bundle.\n");
  process.exit(0);
}
for (const f of findings) console.log(`\n  LEAK  ${f}`);
console.log(`\n${findings.length} leak(s) — do not deploy.\n`);
process.exit(1);
