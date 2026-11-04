import type { MetadataRoute } from "next";

// app privado da turma: nenhum buscador indexa
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
