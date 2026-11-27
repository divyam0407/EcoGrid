import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Navbar } from './Navbar';
import { AssistantDrawer } from '../dashboard/AssistantDrawer';

export const AppLayout: React.FC = () => {
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [navigationOpen, setNavigationOpen] = useState(false);

  return (
    <div className="min-h-screen min-w-0 bg-slate-950 flex flex-col font-sans">
      <Sidebar isOpen={navigationOpen} onClose={() => setNavigationOpen(false)} />
      <div className="min-w-0 md:pl-64 flex flex-col flex-1">
        <Navbar onOpenAssistant={() => setAssistantOpen(true)} onToggleNavigation={() => setNavigationOpen((open) => !open)} />
        <main className="min-w-0 flex-1 p-4 sm:p-6 md:p-8 overflow-y-auto">
          <Outlet />
        </main>
      </div>
      <AssistantDrawer isOpen={assistantOpen} onClose={() => setAssistantOpen(false)} />
    </div>
  );
};
