import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';

export default function Layout() {
  return (
    <div className="flex">
      <Sidebar />
      <main className="min-h-screen flex-1 bg-base p-6">
        <Outlet />
      </main>
    </div>
  );
}
