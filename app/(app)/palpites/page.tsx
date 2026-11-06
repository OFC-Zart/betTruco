import { redirect } from "next/navigation";
import { PalpitesTela } from "@/components/resenha/palpites-tela";
import { PALPITES_ATIVO } from "@/lib/recursos";

export default function PalpitesPage() {
  if (!PALPITES_ATIVO) redirect("/aovivo");
  return <PalpitesTela />;
}
