import { redirect } from "next/navigation";

export default async function Convite({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  redirect(`/entrar?codigo=${encodeURIComponent(codigo)}`);
}
