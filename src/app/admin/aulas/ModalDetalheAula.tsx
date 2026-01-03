"use client";

import React from "react";
import type { Aula } from "../types";

type ModalDetalheAulaProps = {
  aula: Aula;
  onFechar: () => void;
  onEditar: (aula: Aula) => void;
  onExcluir: (aula: Aula) => void;
};

export default function ModalDetalheAula({
  aula,
  onFechar,
  onEditar,
  onExcluir,
}: ModalDetalheAulaProps) {
  if (!aula) return null;

  function formatarDataBR(iso: string) {
    const [yyyy, mm, dd] = iso.split("-");
    return `${dd}/${mm}/${yyyy}`;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-5">
        {/* header */}
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Detalhes da aula
            </h2>
            <p className="text-[11px] text-gray-500 leading-snug">
              {aula.atividadeTexto || "—"}
            </p>
          </div>

          <button
            onClick={onFechar}
            className="text-xs text-gray-500 hover:text-gray-800"
          >
            ✕
          </button>
        </div>

        {/* conteúdo */}
        <div className="text-sm text-gray-800 space-y-3">
          {/* Alunos */}
          <div>
            <div className="text-[11px] font-semibold text-gray-500 uppercase">
              Aluno(s)
            </div>
            <div className="font-semibold text-gray-900 text-sm leading-snug">
              {Array.isArray(aula.alunosNomes) && aula.alunosNomes.length > 0
                ? aula.alunosNomes.join(", ")
                : "—"}
            </div>
          </div>

          {/* Professor(es) */}
          <div>
            <div className="text-[11px] font-semibold text-gray-500 uppercase">
              Professor(es)
            </div>
            <div className="text-xs text-gray-700 leading-snug">
              {aula.professorNome && aula.professorNome.trim() !== ""
                ? aula.professorNome
                : aula.professorId || "—"}
            </div>
          </div>

          {/* Data / Local */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-[11px] font-semibold text-gray-500 uppercase">
                Data
              </div>
              <div className="text-sm text-gray-800 leading-snug">
                {aula.data ? formatarDataBR(aula.data) : "—"}
              </div>
            </div>

            <div>
              <div className="text-[11px] font-semibold text-gray-500 uppercase">
                Local
              </div>
              <div className="text-sm text-gray-800 leading-snug">
                {aula.localNome && aula.localNome.trim() !== ""
                  ? aula.localNome
                  : aula.localId || "—"}
              </div>
            </div>
          </div>

          {/* Horários */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-[11px] font-semibold text-gray-500 uppercase">
                Início
              </div>
              <div className="text-sm text-gray-800 leading-snug">
                {aula.horaInicio || "—"}
              </div>
            </div>

            <div>
              <div className="text-[11px] font-semibold text-gray-500 uppercase">
                Fim
              </div>
              <div className="text-sm text-gray-800 leading-snug">
                {aula.horaFim || "—"}
              </div>
            </div>
          </div>

          {/* Atividade */}
          <div>
            <div className="text-[11px] font-semibold text-gray-500 uppercase">
              Atividade
            </div>
            <div className="text-sm text-gray-800 leading-snug whitespace-pre-line">
              {aula.atividadeTexto || "—"}
            </div>
          </div>

          {/* Referência / Tipo */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-[11px] font-semibold text-gray-500 uppercase">
                Referência
              </div>
              <div className="text-sm text-gray-800 leading-snug">
                {(aula as any)?.referenciaTipo || "—"}
              </div>
            </div>

            <div>
              <div className="text-[11px] font-semibold text-gray-500 uppercase">
                Tipo
              </div>
              <div className="text-sm text-gray-800 leading-snug">
                {aula.tipoNome && aula.tipoNome.trim() !== ""
                  ? aula.tipoNome
                  : aula.tipoCobranca || "—"}
              </div>
            </div>
          </div>
        </div>

        {/* footer */}
        <div className="flex flex-col sm:flex-row gap-2 pt-4">
          <button
            onClick={() => onEditar(aula)}
            className="flex-1 bg-black text-white rounded-xl px-4 py-2 text-xs font-semibold hover:bg-gray-800"
          >
            Editar
          </button>

          <button
            onClick={() => {
              console.log(
                "👉 Clique em EXCLUIR no ModalDetalheAula:",
                aula.id,
                aula.horaInicio
              );
              onExcluir(aula); // 🔴 AQUI é onde o modal chama o pai
            }}
            className="flex-1 bg-red-600 text-white rounded-xl px-4 py-2 text-xs font-semibold hover:bg-red-700"
          >
            Excluir
          </button>
        </div>
      </div>
    </div>
  );
}
