// src/app/admin/gerenciamento/ModalPermissoesRoles.tsx
"use client";

import React, { useState } from "react";

type RoleKey =
  | "gestor"
  | "coordenador"
  | "professores"
  | "secretaria"
  | "responsavel"
  | "aluno";

type SeeFinance = "none" | "partial" | "full";

type PermissaoRole = {
  canEdit: boolean;
  canDelete: boolean;
  seeFinance: SeeFinance;
  seeOnlyLinked: boolean;
};

const ROLE_LABELS: Record<RoleKey, string> = {
  gestor: "Gestor",
  coordenador: "Coordenador",
  professores: "Professores",
  secretaria: "Secretaria",
  responsavel: "Responsável",
  aluno: "Aluno",
};

// valores iniciais, igual sua tabela
const INITIAL_PERMISSOES: Record<RoleKey, PermissaoRole> = {
  gestor: {
    canEdit: true,
    canDelete: true,
    seeFinance: "full",
    seeOnlyLinked: false,
  },
  coordenador: {
    canEdit: true,
    canDelete: false,
    seeFinance: "partial",
    seeOnlyLinked: false,
  },
  professores: {
    canEdit: true,
    canDelete: false,
    seeFinance: "none",
    seeOnlyLinked: true,
  },
  secretaria: {
    canEdit: true,
    canDelete: false,
    seeFinance: "none",
    seeOnlyLinked: false,
  },
  responsavel: {
    canEdit: false,
    canDelete: false,
    seeFinance: "none",
    seeOnlyLinked: true,
  },
  aluno: {
    canEdit: false,
    canDelete: false,
    seeFinance: "none",
    seeOnlyLinked: true,
  },
};

export type ModalPermissoesRolesProps = {
  onClose: () => void;
  // no futuro podemos receber as permissões do Firestore via props
};

export function ModalPermissoesRoles({ onClose }: ModalPermissoesRolesProps) {
  const [permissoes, setPermissoes] =
    useState<Record<RoleKey, PermissaoRole>>(INITIAL_PERMISSOES);

  function toggleBool<K extends keyof PermissaoRole>(
    role: RoleKey,
    campo: K
  ) {
    setPermissoes((prev) => ({
      ...prev,
      [role]: {
        ...prev[role],
        [campo]: !prev[role][campo] as any,
      },
    }));
  }

  function cycleFinance(role: RoleKey) {
    setPermissoes((prev) => {
      const atual = prev[role].seeFinance;
      const proximo: SeeFinance =
        atual === "none" ? "partial" : atual === "partial" ? "full" : "none";

      return {
        ...prev,
        [role]: {
          ...prev[role],
          seeFinance: proximo,
        },
      };
    });
  }

  function renderCheckCell(valor: boolean) {
    return (
      <span
        className={
          "inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-semibold " +
          (valor
            ? "bg-emerald-100 text-emerald-700"
            : "bg-red-100 text-red-600")
        }
      >
        {valor ? "✅" : "✕"}
      </span>
    );
  }

  function renderFinanceCell(valor: SeeFinance) {
    if (valor === "full") {
      return (
        <span className="inline-flex items-center justify-center px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-semibold">
          ✅ sim
        </span>
      );
    }
    if (valor === "partial") {
      return (
        <span className="inline-flex items-center justify-center px-3 py-1 rounded-full bg-amber-100 text-amber-700 text-xs font-semibold">
          ⚠️ parcial
        </span>
      );
    }
    return (
      <span className="inline-flex items-center justify-center px-3 py-1 rounded-full bg-red-100 text-red-600 text-xs font-semibold">
        ❌ não
      </span>
    );
  }

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center">
      {/* backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* card */}
      <div className="relative z-61 w-full max-w-4xl bg-white rounded-2xl shadow-2xl p-6 max-h-[90vh] overflow-auto">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              🔐 Regras de acesso — visão resumida
            </h2>
            <p className="text-xs text-gray-500 mt-1">
              Clique em cada célula para ajustar o que cada perfil pode fazer.
              Nesta primeira versão, as alterações ficam apenas na tela
              (sem salvar no banco).
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-sm text-gray-500 hover:text-gray-800"
          >
            ✕
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-xs border-collapse">
            <thead>
              <tr className="bg-gray-50 text-[11px] text-gray-600">
                <th className="px-3 py-2 text-left font-semibold">Role</th>
                <th className="px-3 py-2 text-center font-semibold">
                  Pode editar?
                </th>
                <th className="px-3 py-2 text-center font-semibold">
                  Pode excluir?
                </th>
                <th className="px-3 py-2 text-center font-semibold">
                  Vê financeiro geral?
                </th>
                <th className="px-3 py-2 text-center font-semibold">
                  Vê apenas vinculados?
                </th>
              </tr>
            </thead>
            <tbody className="text-[11px]">
              {(Object.keys(permissoes) as RoleKey[]).map((role) => {
                const p = permissoes[role];
                return (
                  <tr
                    key={role}
                    className="border-t last:border-b hover:bg-gray-50"
                  >
                    <td className="px-3 py-2 font-semibold text-gray-800">
                      {ROLE_LABELS[role]}
                    </td>

                    {/* Pode editar */}
                    <td className="px-3 py-2 text-center">
                      <button
                        type="button"
                        onClick={() => toggleBool(role, "canEdit")}
                      >
                        {renderCheckCell(p.canEdit)}
                      </button>
                    </td>

                    {/* Pode excluir */}
                    <td className="px-3 py-2 text-center">
                      <button
                        type="button"
                        onClick={() => toggleBool(role, "canDelete")}
                      >
                        {renderCheckCell(p.canDelete)}
                      </button>
                    </td>

                    {/* Vê financeiro geral? */}
                    <td className="px-3 py-2 text-center">
                      <button
                        type="button"
                        onClick={() => cycleFinance(role)}
                      >
                        {renderFinanceCell(p.seeFinance)}
                      </button>
                    </td>

                    {/* Vê apenas vinculados? */}
                    <td className="px-3 py-2 text-center">
                      <button
                        type="button"
                        onClick={() => toggleBool(role, "seeOnlyLinked")}
                      >
                        {renderCheckCell(p.seeOnlyLinked)}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold border border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            Fechar
          </button>
          <button
            type="button"
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-gray-900 text-white opacity-60 cursor-not-allowed"
            title="Em breve: salvar no Firestore"
          >
            Salvar (em breve)
          </button>
        </div>
      </div>
    </div>
  );
}
