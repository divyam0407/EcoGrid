import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Navbar } from './Navbar';
import { AssistantDrawer } from '../dashboard/AssistantDrawer';

export const AppLayout: React.FC = () => {
  const [assistantOpen, setAssistantOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col font-sans">
      <Sidebar />
      <div className="pl-64 flex flex-col flex-1">
        <Navbar onOpenAssistant={() => setAssistantOpen(true)} />
        <main className="flex-1 p-6 md:p-8 overflow-y-auto">
          <Outlet />
        </main>
      </div>
      <AssistantDrawer isOpen={assistantOpen} onClose={() => setAssistantOpen(false)} />
    </div>
  );
};
