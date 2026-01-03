'use client';
import React from 'react';
import { useSession } from '../lib/auth';

type Allowed = Array<'gestor' | 'professor' | 'responsavel'>;

export default function RoleGuard({
  allow,
  children,
}: {
  allow: Allowed;
  children: React.ReactNode;
}) {
  const { loading, userDoc } = useSession();

  if (loading) {
    return (
      <div className="p-6 animate-pulse text-sm text-muted-foreground">
        Carregando permissões…
      </div>
    );
  }

  if (!userDoc) {
    return (
      <div className="p-6 space-y-2">
        <p className="font-medium">Acesso restrito</p>
        <p className="text-sm text-muted-foreground">Faça login para continuar.</p>
      </div>
    );
  }

  if (userDoc.status !== 'ativo' || !allow.includes(userDoc.role)) {
    return (
      <div className="p-6 space-y-2">
        <p className="font-medium">Acesso negado</p>
        <p className="text-sm text-muted-foreground">
          Seu perfil atual não possui permissão para esta área.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
