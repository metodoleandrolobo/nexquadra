import { AuthProvider } from '../../lib/auth';
import Sidebar from '../../components/Sidebar';


export default function AdminLayout({ children }: { children: React.ReactNode }) {
return (
<AuthProvider>
<div className="min-h-dvh flex">
<Sidebar />
<main className="flex-1">{children}</main>
</div>
</AuthProvider>
);
}