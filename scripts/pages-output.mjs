import { copyFile, mkdir, writeFile, rm } from "node:fs/promises";
await copyFile("dist-pages/pages/index.html", "dist-pages/index.html");
await rm("dist-pages/pages", { recursive: true });

// Cada rota tem HTML próprio: abrir/recarregar /eventos/ funciona sem servidor Node.
for (const route of ["eventos", "gestao", "entrar"]) {
  await mkdir(`dist-pages/${route}`, { recursive: true });
  await copyFile("dist-pages/index.html", `dist-pages/${route}/index.html`);
}
await writeFile("dist-pages/.nojekyll", "");
