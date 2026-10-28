// So sánh schema của 2 bộ migration (chạy trên PGlite): bảng, cột, ràng buộc, index, hàm (định nghĩa + quyền),
// trigger, policy RLS, quyền bảng / cột, publication. Dùng khi gom / viết lại migration để chắc chắn kết quả giống hệt.
// Chạy: node tests/schema-diff.mjs <thư mục migration A> <thư mục migration B> [--twice-b] [--a-then-b]
//   --twice-b  : chạy bộ B hai lần (kiểm tra "chạy lại nhiều lần an toàn")
//   --a-then-b : chạy A rồi B lên trên (kiểm tra nâng cấp database cũ bằng bộ mới)
import { readFile, readdir } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const [dirA, dirB, ...flags] = process.argv.slice(2)
const stub = await readFile(new URL('./supabase-stub.sql', import.meta.url), 'utf8')

async function files(dir) {
  return (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort().map((f) => `${dir}/${f}`)
}
async function build(dirs) {
  const db = new PGlite()
  await db.exec(stub)
  for (const dir of dirs) for (const f of await files(dir)) await db.exec(await readFile(f, 'utf8'))
  return db
}

const Q = {
  columns: `select table_name, column_name, data_type, udt_name, is_nullable, column_default, is_generated, generation_expression
            from information_schema.columns where table_schema = 'public' order by 1, 2`,
  constraints: `select conrelid::regclass::text, conname, pg_get_constraintdef(oid) from pg_constraint
                where connamespace = 'public'::regnamespace order by 1, 2`,
  indexes: `select tablename, indexname, indexdef from pg_indexes where schemaname = 'public' order by 1, 2`,
  functions: `select p.proname, pg_get_function_identity_arguments(p.oid), pg_get_functiondef(p.oid),
                     coalesce(array_to_string(array(select x::text from unnest(p.proacl) x order by 1), ','), 'DEFAULT')
              from pg_proc p where p.pronamespace = 'public'::regnamespace order by 1, 2`,
  triggers: `select tgrelid::regclass::text, tgname, pg_get_triggerdef(oid) from pg_trigger where not tgisinternal order by 1, 2`,
  policies: `select schemaname, tablename, policyname, permissive, roles::text, cmd, qual, with_check from pg_policies order by 1, 2, 3`,
  rls: `select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' order by 1`,
  tableGrants: `select table_name, grantee, string_agg(privilege_type, ',' order by privilege_type)
                from information_schema.role_table_grants where table_schema = 'public' group by 1, 2 order by 1, 2`,
  columnGrants: `select table_name, column_name, grantee, privilege_type from information_schema.column_privileges
                 where table_schema = 'public' and grantee in ('anon', 'authenticated') order by 1, 2, 3, 4`,
  types: `select t.typname, string_agg(e.enumlabel, ',' order by e.enumsortorder) from pg_type t
          join pg_enum e on e.enumtypid = t.oid where t.typnamespace = 'public'::regnamespace group by 1 order by 1`,
  publication: `select pubname, tablename from pg_publication_tables order by 1, 2`,
  buckets: `select id, public, file_size_limit, allowed_mime_types::text from storage.buckets order by 1`,
}

async function snapshot(db) {
  const out = {}
  for (const [k, sql] of Object.entries(Q)) out[k] = (await db.query(sql, [], { rowMode: 'array' })).rows.map((r) => JSON.stringify(r))
  return out
}

const twice = flags.includes('--twice-b')
const upgrade = flags.includes('--a-then-b')
const a = await snapshot(await build([dirA]))
const b = await snapshot(await build(upgrade ? [dirA, dirB] : twice ? [dirB, dirB] : [dirB]))

let diffs = 0
for (const k of Object.keys(Q)) {
  const onlyA = a[k].filter((x) => !b[k].includes(x))
  const onlyB = b[k].filter((x) => !a[k].includes(x))
  if (!onlyA.length && !onlyB.length) continue
  diffs += onlyA.length + onlyB.length
  console.log(`\n=== ${k}`)
  for (const x of onlyA) console.log('  - A:', x.slice(0, 400))
  for (const x of onlyB) console.log('  + B:', x.slice(0, 400))
}
console.log(diffs ? `\n${diffs} khác biệt` : '\nGIỐNG HỆT NHAU')
