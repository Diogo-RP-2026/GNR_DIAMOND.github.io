for (const key of ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"]) {
  if (!process.env[key] || /TEU-PROJETO|CHAVE_PUBLICA/.test(process.env[key])) {
    throw new Error(`Falta configurar ${key} nas variáveis do repositório.`);
  }
}
try {
  new URL(process.env.VITE_SUPABASE_URL);
} catch {
  throw new Error("VITE_SUPABASE_URL inválida.");
}
