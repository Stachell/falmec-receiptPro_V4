import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import NewRun from "./pages/NewRun";
import RunDetail from "./pages/RunDetail";
import NotFound from "./pages/NotFound";
import { fileSystemService } from "@/services/fileSystemService";
import { useMasterDataStore } from "@/store/masterDataStore";
import { useRunAutoSave } from "@/hooks/useRunAutoSave";

const queryClient = new QueryClient();

const App = () => {
  // PROJ-23 Phase A2: Auto-save active run to IndexedDB on state changes
  useRunAutoSave();

  // PROJ-12/19: App-Start hooks
  useEffect(() => {
    // Rotate old log files (delete > 30 days)
    fileSystemService.rotateHomeLogs().catch(() => {
      // Silently ignore — rotation is best-effort (no handle after reload)
    });
    // PROJ-19: Hydrate master data from IndexedDB into memory on boot
    useMasterDataStore.getState().load().catch(() => {
      // Silently ignore — store starts empty, user can re-upload
    });
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/new-run" element={<NewRun />} />
            <Route path="/run/:runId" element={<RunDetail />} />
            {/* /runs route removed */}
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
