'use client';
import React from 'react';
import Link from 'next/link';
import { useRole } from '../lib/auth';
import { cn } from '../lib/utils';


const NAV = [
{ label: 'Dashboard', href: '/admin', roles: ['gestor','professor','responsavel'] },
{ label: 'Perfil', href: '/admin/perfil', roles: ['gestor','professor','responsavel'] }, // <— novo menu PERFIL
{ label: 'Aulas', href: '/admin/aulas', roles: ['gestor','professor'] },
{ label: 'Pagamentos', href: '/admin/pagamentos', roles: ['gestor','professor','responsavel'] },
{ label: 'Gestão', href: '/admin/gestao', roles: ['gestor'] }, // <— menu Gestão
];


export default function Sidebar() {
const role = useRole();
if (!role) return null;
return (
<aside className="w-full md:w-64 shrink-0 border-r bg-background">
<nav className="p-3 space-y-1">
{NAV.filter(i => i.roles.includes(role)).map(item => (
<Link key={item.href} href={item.href} className={cn("block rounded-xl px-3 py-2 text-sm hover:bg-accent")}>{item.label}</Link>
))}
</nav>
</aside>
);
}