/**
 * Static checks over supabase/migrations.
 *
 *   npm run check:migrations
 *
 * There is no Docker on this machine, so migrations cannot be run before they
 * reach the real database. This does not replace that. It only catches the
 * specific ways these migrations have already gone wrong:
 *
 *   1. A function redefined with a different signature. `create or replace`
 *      only replaces when the signature matches, so adding a parameter creates
 *      an *overload*. That is what broke get_menu(): a three-argument call
 *      suddenly matched two candidates.
 *
 *   2. A function redefined with a different return type and no preceding
 *      drop. Postgres refuses outright: "cannot change return type".
 *
 *   3. `create table` for a table an earlier migration already created, with
 *      no drop in between. That is what would have failed on
 *      delivery_partners.
 */
import { readFileSync, readdirSync } from "node:fs";

const dir = "supabase/migrations";
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

/** Signature and return type of every function definition, in file order. */
const funcs = [];
const tables = [];
const problems = [];

for (const file of files) {
  const sql = readFileSync(`${dir}/${file}`, "utf8");
  /* strip line comments so commented-out DDL is not counted */
  const bare = sql.replace(/^\s*--.*$/gm, "");

  /* Statements must be considered in the order they appear. Collecting every
     CREATE and then every DROP loses that, and makes a migration that drops
     before recreating look like a duplicate definition. */
  const events = [];

  /* A regex cannot find the end of the argument list: `default now()` contains
     its own parentheses, and stopping at the first ")" silently skipped the
     whole definition — which is precisely how the kitchen_is_open overload got
     through. Balance the parentheses by hand instead. */
  const headRe = /create\s+(?:or\s+replace\s+)?function\s+public\.(\w+)\s*\(/gi;
  for (const m of bare.matchAll(headRe)) {
    const name = m[1];
    let i = m.index + m[0].length;
    let depth = 1;
    while (i < bare.length && depth > 0) {
      if (bare[i] === "(") depth++;
      else if (bare[i] === ")") depth--;
      i++;
    }
    const rawArgs = bare.slice(m.index + m[0].length, i - 1);
    const after = bare.slice(i, i + 400);
    const retM = after.match(/^\s*returns\s+([\s\S]*?)(?:\blanguage\b|\bas\b)/i);
    if (!retM) continue;

    /* Split on top-level commas only — a default value may contain commas. */
    const parts = [];
    let buf = "", d = 0;
    for (const ch of rawArgs) {
      if (ch === "(") d++;
      if (ch === ")") d--;
      if (ch === "," && d === 0) { parts.push(buf); buf = ""; } else buf += ch;
    }
    if (buf.trim()) parts.push(buf);

    /* argument *types* form the signature; names and defaults do not */
    const types = parts
      .map((a) => a.replace(/\bdefault\b[\s\S]*$/i, "").trim())
      .filter(Boolean)
      .map((a) => a.split(/\s+/).slice(1).join(" ").toLowerCase())
      .filter(Boolean);

    events.push({
      at: m.index,
      kind: "func",
      file,
      name,
      sig: types.join(", "),
      ret: retM[1].replace(/\s+/g, " ").trim().toLowerCase().slice(0, 60),
    });
  }

  for (const m of bare.matchAll(/drop\s+function\s+(?:if\s+exists\s+)?public\.(\w+)\s*\(([^)]*)\)/gi))
    events.push({
      at: m.index,
      kind: "func",
      drop: true,
      file,
      name: m[1],
      sig: m[2].split(",").map((x) => x.trim().toLowerCase()).filter(Boolean).join(", "),
    });

  for (const m of bare.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?public\.(\w+)/gi))
    events.push({ at: m.index, kind: "table", file, name: m[1], guarded: /if\s+not\s+exists/i.test(m[0]) });

  for (const m of bare.matchAll(/drop\s+table\s+(?:if\s+exists\s+)?public\.(\w+)/gi))
    events.push({ at: m.index, kind: "table", drop: true, file, name: m[1] });

  events.sort((a, b) => a.at - b.at);
  for (const e of events) (e.kind === "func" ? funcs : tables).push(e);
}

/* ---- 1 & 2: function signature / return-type drift ----
   An overload raised in one migration may be cleaned up by a later one. That
   still cost an outage the first time, so it is reported — but as resolved,
   not as something left to fix. */
const seen = new Map(); // name -> [{sig, ret, file}]
const resolved = [];
for (const f of funcs) {
  if (f.drop) {
    const prior = seen.get(f.name) || [];
    seen.set(f.name, prior.filter((p) => p.sig !== f.sig));
    for (let i = problems.length - 1; i >= 0; i--) {
      if (problems[i].name === f.name && problems[i].olderSig === f.sig) {
        resolved.push({ ...problems.splice(i, 1)[0], by: f.file });
      }
    }
    continue;
  }
  const prior = seen.get(f.name) || [];
  const sameSig = prior.find((p) => p.sig === f.sig);
  const otherSig = prior.find((p) => p.sig !== f.sig);

  if (sameSig && sameSig.ret !== f.ret)
    problems.push({
      name: f.name,
      text:
        `${f.file}: public.${f.name}(${f.sig}) changes return type from ` +
        `"${sameSig.ret}" to "${f.ret}" with no drop first — Postgres will refuse.`,
    });
  if (otherSig && !sameSig)
    problems.push({
      name: f.name,
      olderSig: otherSig.sig,
      text:
        `${f.file}: public.${f.name}(${f.sig}) has a different signature to the ` +
        `earlier (${otherSig.sig}) in ${otherSig.file}. This creates an OVERLOAD, ` +
        `not a replacement — calls with the shorter argument list become ambiguous.`,
    });

  seen.set(f.name, [...prior.filter((p) => p.sig !== f.sig), { sig: f.sig, ret: f.ret, file: f.file }]);
}

/* ---- 3: table recreated without a drop ---- */
const live = new Set();
for (const t of tables) {
  if (t.drop) { live.delete(t.name); continue; }
  if (live.has(t.name) && !t.guarded)
    problems.push({
      name: t.name,
      text:
        `${t.file}: create table public.${t.name} but it already exists from an ` +
        `earlier migration and is not dropped first — "relation already exists".`,
    });
  live.add(t.name);
}

console.log(`\nChecked ${files.length} migration(s): ${files.join(", ")}\n`);

for (const r of resolved)
  console.log(`  was broken, fixed in ${r.by}\n    ${r.text}\n`);

if (!problems.length) {
  console.log("  Nothing outstanding.\n");
  process.exit(0);
}
for (const p of problems) console.log(`  PROBLEM  ${p.text}\n`);
console.log(`${problems.length} problem(s) outstanding.\n`);
process.exit(1);
