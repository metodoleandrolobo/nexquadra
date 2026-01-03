"use client";

import React, { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { db } from "../../../lib/firebase";
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import type { PlanoAula, ModalPlanoAulaProps } from "./ModalPlanoAula";

type Props = {
  onClose?: () => void;
  onChanged?: (items: PlanoAula[]) => void;
};

type Row = PlanoAula & { temaLower: string };

const ModalPlanoAula = dynamic<ModalPlanoAulaProps>(
  () => import("./ModalPlanoAula"),
  { ssr: false }
);

export default function ModalPlanosAulaList({ onClose, onChanged }: Props) {
  const [itens, setItens] = useState<Row[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [modo, setModo] = useState<"novo" | "editar">("novo");
  const [planoSel, setPlanoSel] = useState<Row | null>(null);

  const [modalidades, setModalidades] = useState<{ id: string; nome: string }[]>([]);
  const [filtroModalidade, setFiltroModalidade] = useState<string>(""); // "" = todas
  const [busca, setBusca] = useState("");

  useEffect(() => {
    (async () => {
      const snap = await getDocs(collection(db, "modalidades"));
      const arr: { id: string; nome: string }[] = [];
      snap.forEach((d) => {
        const x: any = d.data();
        if (x?.ativo !== false) arr.push({ id: d.id, nome: x?.nome ?? "" });
      });
      arr.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }));
      setModalidades(arr);
    })();
  }, []);

  useEffect(() => {
    // servidor: apenas orderBy(tema) para evitar índice composto
    const q = query(collection(db, "planosAula"), orderBy("tema", "asc"));

    const unsub = onSnapshot(q, (snap) => {
      const arr: Row[] = snap.docs.map((d) => {
        const x: any = d.data();
        return {
          id: d.id,
          modalidadeId: x?.modalidadeId ?? "",
          modalidadeNome: x?.modalidadeNome ?? "",
          tema: x?.tema ?? "",
          temaLower: (x?.temaLower ?? x?.tema ?? "").toString().toLowerCase(),
          atividades: x?.atividades ?? "",
          ativo: x?.ativo ?? true,
        };
      });

      // client sort secundário por modalidade
      arr.sort((a, b) => {
        const mod = (a.modalidadeNome || "").localeCompare(b.modalidadeNome || "", "pt-BR", { sensitivity: "base" });
        if (mod !== 0) return mod;
        return (a.temaLower || "").localeCompare(b.temaLower || "", "pt-BR");
      });

      setItens(arr);
      setCarregando(false);
      onChanged?.(arr.map(({ temaLower, ...base }) => base));
    }, (e) => {
      console.error(e);
      setErro("Falha ao carregar planos de aula.");
      setCarregando(false);
    });

    return () => unsub();
  }, [onChanged]);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return itens.filter((p) => {
      if (filtroModalidade && p.modalidadeId !== filtroModalidade) return false;
      if (!termo) return true;
      return p.temaLower.includes(termo) || (p.modalidadeNome || "").toLowerCase().includes(termo);
    });
  }, [itens, filtroModalidade, busca]);

  function abrirNovo() {
    setModo("novo");
    setPlanoSel(null);
    setShowModal(true);
  }
  function abrirEditar(p: Row) {
    setModo("editar");
    setPlanoSel(p);
    setShowModal(true);
  }

  async function alternarAtivo(p: Row) {
    try {
      const ref = doc(db, "planosAula", p.id);
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error("Plano não encontrado.");
        const atual = (snap.data()?.ativo ?? true) as boolean;
        tx.update(ref, { ativo: !atual, atualizadoEm: serverTimestamp() });
      });
    } catch (e) {
      console.error(e);
      setErro("Não foi possível alterar o status.");
    }
  }

  async function deletar(p: Row) {
    if (!confirm(`Excluir plano "${p.tema}"?`)) return;
    try {
      const ref = doc(db, "planosAula", p.id);
      const idxRef = doc(db, "index_planosAula", `${p.modalidadeId}__${(p.tema || "").toLowerCase()}`);
      await runTransaction(db, async (tx) => {
        const s = await tx.get(ref);
        if (!s.exists()) return;
        const i = await tx.get(idxRef);
        if (i.exists() && i.data()?.planoId === p.id) tx.delete(idxRef);
        tx.delete(ref);
      });
    } catch (e) {
      console.error(e);
      setErro("Não foi possível excluir.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Planos de aula</h2>
          <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-800">✕</button>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
          <div className="flex gap-2">
            <select
              className="border rounded-xl px-3 py-2 text-sm"
              value={filtroModalidade}
              onChange={(e) => setFiltroModalidade(e.target.value)}
            >
              <option value="">Todas as modalidades</option>
              {modalidades.map((m) => (
                <option key={m.id} value={m.id}>{m.nome}</option>
              ))}
            </select>

            <input
              className="border rounded-xl px-3 py-2 text-sm"
              placeholder="Buscar por tema ou modalidade..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>

          <button onClick={abrirNovo} className="text-sm border rounded-xl px-4 py-2 hover:bg-gray-100">
            + Adicionar plano
          </button>
        </div>

        {erro && <div className="text-xs text-red-600 font-medium">{erro}</div>}

        {carregando ? (
          <div className="text-sm text-gray-500">Carregando...</div>
        ) : filtrados.length === 0 ? (
          <div className="text-sm text-gray-500">Nenhum plano encontrado.</div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {filtrados.map((p) => (
              <li key={p.id} className="py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm">
                  <div className="font-medium text-gray-900">
                    {p.tema}
                    <span className="ml-2 text-gray-500 text-xs">({p.modalidadeNome})</span>
                  </div>
                  <div className="text-[11px] text-gray-500 truncate max-w-xl">
                    {p.atividades}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className={`text-[10px] px-2 py-1 rounded-lg uppercase tracking-wide ${p.ativo ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-600"}`}>
                    {p.ativo ? "ATIVO" : "INATIVO"}
                  </span>
                  <button onClick={() => abrirEditar(p)} className="text-xs px-3 py-2 rounded-lg bg-black text-white hover:bg-gray-800">Editar</button>
                  <button onClick={() => alternarAtivo(p)} className="text-xs px-3 py-2 rounded-lg border hover:bg-gray-50">
                    {p.ativo ? "Inativar" : "Ativar"}
                  </button>
                  <button onClick={() => deletar(p)} className="text-xs px-3 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700">
                    Excluir
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {showModal && (
          <ModalPlanoAula
            modo={modo}
            planoInicial={modo === "editar" ? {
              id: planoSel!.id,
              modalidadeId: planoSel!.modalidadeId,
              modalidadeNome: planoSel!.modalidadeNome,
              tema: planoSel!.tema,
              atividades: planoSel!.atividades,
              ativo: planoSel!.ativo,
            } : null}
            onClose={() => setShowModal(false)}
            onSaved={() => setShowModal(false)}
          />
        )}
      </div>
    </div>
  );
}
