import { readFile, readdir } from "node:fs/promises";
import { getPlatformProxy, unstable_splitSqlQuery } from "wrangler";

export async function catalogDB(t) {
  const { env, dispose } = await getPlatformProxy({
    persist: false,
    remoteBindings: false,
  });
  t.after(dispose);
  const migrations = new URL("../migrations/", import.meta.url);
  const names = (await readdir(migrations)).filter(n => n.endsWith(".sql")).sort();
  for (const name of names) {
    const sql = await readFile(new URL(name, migrations), "utf8");
    const statements = unstable_splitSqlQuery(sql);
    await env.DB.batch(statements.map(statement => env.DB.prepare(statement)));
  }
  return env;
}
