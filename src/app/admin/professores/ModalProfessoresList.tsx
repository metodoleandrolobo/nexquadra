//src/app/admin/professores/ModalProfessoresList.tsx
"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { db } from "../../../lib/firebase";
import {
  collection,
  query,
  orderBy,
  doc,
  runTransaction,
  serverTimestamp,
  getDocs,
} from "firebase/firestore";

export type Professor = {
  id: string;
  nome: string;
  cpf?: string;
  email: string;
  telefone?: string;
  ativo: boolean;
  funcao: string;

  cep?: string;
  endereco?: string;
  numero?: string;
  complemento?: string;
};

type Props = {
  onClose?: () => void;
  onChanged?: (items: Professor[]) => void;
};

export default function ModalProfessoresList({ onClose, onChanged }: Props) {
  const router = useRouter();

  const [professores, setProfessores] = useState<Professor[]>([]);
  const [carregando, setCarregando] = useState(true);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [erro, setErro] = useState<string>("");

  const [profVisualizando, setProfVisualizando] = useState<Professor | null>(
    null
  );

  // 🔁 Função central para carregar/recarregar a lista do Firestore
  async function carregarProfessores() {
    try {
      setCarregando(true);
      const q = query(collection(db, "professores"), orderBy("nome", "asc"));
      const snap = await getDocs(q);

      const items: Professor[] = snap.docs.map((d) => ({
          id: d.id,
          nome: d.data().nome ?? "",
          cpf: d.data().cpf ?? "",
          telefone: d.data().telefone ?? "",
          email: d.data().email ?? "",
          ativo: d.data().ativo ?? true,
          funcao: d.data().funcao ?? "",

          cep: d.data().cep ?? "",
          endereco: d.data().endereco ?? "",
          numero: d.data().numero ?? "",
          complemento: d.data().complemento ?? "",
        }));

      setProfessores(items);
      onChanged?.(items);

      // se tiver alguém em visualização, atualiza os dados dele
      setProfVisualizando((prev) => {
        if (!prev) return prev;
        const atualizado = items.find((p) => p.id === prev.id);
        return atualizado || null;
      });
    } catch (e: any) {
      console.error(e);
      setErro(e?.message || "Erro ao carregar colaboradores.");
    } finally {
      setCarregando(false);
    }
  }

  // carrega na primeira vez que o modal abre
  useEffect(() => {
    carregarProfessores();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function abrirNovoProfessor() {
    onClose?.();
    router.push("/admin/novo-colaborador");
  }

  function irParaEdicaoProfessor(p: Professor) {
    onClose?.();
    router.push(`/admin/editar-colaborador/${p.id}`);
  }

  // 🔁 Alternar ativo/inativo e depois recarregar a lista
  async function alternarAtivo(p: Professor) {
    if (busyId) return;
    setErro("");
    setBusyId(p.id);

    try {
      const ref = doc(db, "professores", p.id);
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error("Professor não encontrado.");

        const atual = (snap.data()?.ativo ?? true) as boolean;
        tx.update(ref, { ativo: !atual, atualizadoEm: serverTimestamp() });
      });

      // ✅ depois que o backend confirmou, recarrega a lista inteira
      await carregarProfessores();
    } catch (e: any) {
      console.error(e);
      setErro(e?.message || "Não foi possível alterar o status do professor.");
    } finally {
      setBusyId(null);
    }
  }

  // 🗑 Deletar colaborador e recarregar a lista
  async function deletarProfessor(p: Professor) {
    if (busyId) return;
    if (!confirm(`Excluir o professor/colaborador "${p.nome}"?`)) return;

    setErro("");
    setBusyId(p.id);

    try {
      const resp = await fetch(`/api/admin/colaboradores/${p.id}`, {
        method: "DELETE",
      });

      if (!resp.ok) {
        let msg = "Não foi possível excluir o colaborador.";
        try {
          const data = await resp.json();
          if (data?.error) msg = data.error;
        } catch {
          /* resposta não era JSON */
        }
        throw new Error(msg);
      }

      // se estava visualizando esse colaborador, fecha a janela de detalhes
      if (profVisualizando?.id === p.id) {
        setProfVisualizando(null);
      }

      // ✅ recarrega a lista do Firestore
      await carregarProfessores();
    } catch (e: any) {
      console.error(e);
      setErro(e?.message || "Erro ao excluir colaborador.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      {/* MODAL PRINCIPAL: LISTA */}
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl p-4 space-y-4">
          {/* Header do modal */}
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              Colaboradores
            </h2>
            <button
              onClick={onClose}
              className="text-sm text-gray-500 hover:text-gray-800"
            >
              ✕
            </button>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500">
              Gerencie os colaboradores cadastrados. Clique no nome para ver os
              detalhes.
            </p>
            <button
              onClick={abrirNovoProfessor}
              className="text-sm border rounded-xl px-4 py-2 hover:bg-gray-100"
            >
              + Adicionar colaborador
            </button>
          </div>

          {erro && (
            <div className="text-xs text-red-600 font-medium mb-2">{erro}</div>
          )}

          {carregando ? (
            <div className="text-sm text-gray-500">Carregando...</div>
          ) : professores.length === 0 ? (
            <div className="text-sm text-gray-500">
              Nenhum professor cadastrado.
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {professores.map((p) => (
                <li
                  key={p.id}
                  className={`py-3 px-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-xl transition
                    ${
                      p.ativo
                        ? "bg-white"
                        : "bg-red-50 border border-red-200"
                    }`}
                >
                  {/* Clicar no nome → abre janela de detalhes */}
                  <button
                    type="button"
                    onClick={() => setProfVisualizando(p)}
                    className="text-left text-sm flex-1 group"
                  >
                    <div
                      className={`font-medium ${
                        p.ativo ? "text-gray-900" : "text-red-700"
                      } group-hover:underline`}
                    >
                      {p.nome}
                    </div>
                    <div
                      className={`text-xs ${
                        p.ativo ? "text-gray-600" : "text-red-600"
                      }`}
                    >
                      {p.email}
                    </div>
                    {p.telefone && (
                      <div className="text-xs text-gray-500">
                        {p.telefone}
                      </div>
                    )}
                     {p.funcao && (
                      <div className="text-xs text-gray-500">
                        {p.funcao}
                      </div>
                    )}
                  </button>

                  {/* AÇÕES */}
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] px-2 py-1 rounded-lg uppercase tracking-wide ${
                        p.ativo
                          ? "bg-green-100 text-green-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {p.ativo ? "ATIVO" : "INATIVO"}
                    </span>

                    <button
                      onClick={() => alternarAtivo(p)}
                      disabled={busyId === p.id}
                      className={`text-xs px-3 py-2 rounded-lg border disabled:opacity-50
                        ${
                          p.ativo
                            ? "bg-white hover:bg-gray-50"
                            : "bg-white hover:bg-red-50"
                        }`}
                    >
                      {p.ativo ? "Inativar" : "Ativar"}
                    </button>

                    <button
                      onClick={() => deletarProfessor(p)}
                      disabled={busyId === p.id}
                      className="text-xs px-3 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      Excluir
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* MODAL DE DETALHES */}
      {profVisualizando && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">
                Detalhes do colaborador
              </h3>
              <button
                onClick={() => setProfVisualizando(null)}
                className="text-sm text-gray-500 hover:text-gray-800"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-[11px] text-gray-500 uppercase">
                    Nome
                  </div>
                  <div className="text-sm text-gray-900">
                    {profVisualizando.nome}
                  </div>
                </div>
                <span
                  className={`text-[10px] px-2 py-1 rounded-lg uppercase tracking-wide ${
                    profVisualizando.ativo
                      ? "bg-green-100 text-green-700"
                      : "bg-red-100 text-red-700"
                  }`}
                >
                  {profVisualizando.ativo ? "ATIVO" : "INATIVO"}
                </span>
              </div>

              <div>
                <div className="text-[11px] text-gray-500 uppercase">Email</div>
                <div className="text-sm text-gray-800 wrap-break-words">
                  {profVisualizando.email}
                </div>
              </div>

              {profVisualizando.telefone && (
                <div>
                  <div className="text-[11px] text-gray-500 uppercase">
                    Telefone
                  </div>
                  <div className="text-sm text-gray-800">
                    {profVisualizando.telefone}
                  </div>
                </div>
              )}
            </div>

            {profVisualizando.funcao && (
  <div>
    <div className="text-[11px] text-gray-500 uppercase">Função</div>
    <div className="text-sm text-gray-800">
      {profVisualizando.funcao}
    </div>
  </div>
)}

{profVisualizando.cpf && (
  <div>
    <div className="text-[11px] text-gray-500 uppercase">CPF</div>
    <div className="text-sm text-gray-800">{profVisualizando.cpf}</div>
  </div>
)}

{profVisualizando.cep && (
  <div>
    <div className="text-[11px] text-gray-500 uppercase">CEP</div>
    <div className="text-sm text-gray-800">{profVisualizando.cep}</div>
  </div>
)}

{profVisualizando.endereco && (
  <div>
    <div className="text-[11px] text-gray-500 uppercase">Endereço</div>
    <div className="text-sm text-gray-800 wrap-break-words">
      {profVisualizando.endereco}
    </div>
  </div>
)}

{profVisualizando.numero && (
  <div>
    <div className="text-[11px] text-gray-500 uppercase">Número</div>
    <div className="text-sm text-gray-800">{profVisualizando.numero}</div>
  </div>
)}

{profVisualizando.complemento && (
  <div>
    <div className="text-[11px] text-gray-500 uppercase">Complemento</div>
    <div className="text-sm text-gray-800 wrap-break-words">
      {profVisualizando.complemento}
    </div>
  </div>
)}


            <div className="pt-2 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  const p = profVisualizando;
                  setProfVisualizando(null);
                  if (p) {
                    irParaEdicaoProfessor(p);
                  }
                }}
                className="flex-1 bg-black text-white rounded-xl px-3 py-2 text-xs font-semibold hover:bg-gray-800"
              >
                Editar colaborador
              </button>
              <button
                type="button"
                onClick={() => setProfVisualizando(null)}
                className="flex-1 border rounded-xl px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
