import { TurmaProvider } from "@/components/resenha/turma-provider";
import { TabBar } from "@/components/resenha/tab-bar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <TurmaProvider>
      <div className="mx-auto min-h-dvh max-w-md px-4 pb-28 pt-[max(env(safe-area-inset-top),0.75rem)]">
        {children}
      </div>
      <TabBar />
    </TurmaProvider>
  );
}
