import { Suspense } from "react";
import { Entrar } from "./entrar";

export const metadata = { title: "Entrar · Placar da Resenha" };

export default function Page() {
  return (
    <Suspense>
      <Entrar />
    </Suspense>
  );
}
