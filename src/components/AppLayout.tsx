import { ReactNode } from 'react';
import { AppSidebar } from './AppSidebar';
import { AppFooter } from './AppFooter';

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="flex flex-col min-h-screen w-full bg-background">
      <AppSidebar />
      <main className="flex-1 overflow-auto px-[11.5vh]">
        {children}
      </main>
      <AppFooter />
    </div>
  );
}
