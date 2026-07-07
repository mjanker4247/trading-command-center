import { TopNav } from "@/components/layout/TopNav";
import { AppContent } from "@/components/layout/AppContent";
import { AppDataWarmup } from "@/components/layout/AppDataWarmup";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-page">
      <AppDataWarmup />
      <TopNav />
      <AppContent>{children}</AppContent>
    </div>
  );
}
