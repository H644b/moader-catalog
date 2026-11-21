import { main, session, nav, errorPage } from "./ui.js";
import { discover, detail } from "./discover.js";
import { account, authForm } from "./account.js";
import { editor, studio } from "./studio.js";
const [first, second, third] = location.pathname.split("/").filter(Boolean);
session.then(nav).catch(() => nav(null));
try {
  if (!first) await discover();
  else if (first === "mods") await detail(second, third);
  else if (first === "studio") {
    const u = await session;
    if (!second) await studio(u);
    else await editor(u, second === "new" ? null : second);
  } else if (first === "account") account(await session);
  else if (["login", "signup", "recover"].includes(first)) authForm(first);
  else
    errorPage(
      Object.assign(new Error("This page could not be found."), {
        status: 404,
      }),
    );
} catch (err) {
  errorPage(err);
}
