"use client";

import React, { useEffect, useState } from "react";
import { db } from "../../../lib/firebase";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";

export type Modalidade = { id: string; nome: string; ativo: boolean };

export type PlanoAula = {
  id: string;
  modalidadeId: string;
  modalidadeNome: string;
  tema: string;           // título do plano
  atividades: string;     // conteúdo
  ativo: boolean;
};

export type ModalPlanoAulaProps = {
  modo: "novo" | "editar";
  planoInicial?: PlanoAula | null;
  onClose: () => void;
  onSaved: (plano: PlanoAula) => void;
};

function norm(v: string) { return (v || "").trim(); }
function keyLower(v: string) { return norm(v).toLowerCase(); }
function idxKey(modalidadeId: string, tema: string) {
  return `${modalidadeId}__${keyLower(tema)}`;
}

/** sem query composta: checa no índice manual */
async function temaJaExiste(modalidadeId: string, tema: string, ignoreId?: string) {
  const ref = doc(db, "index_planosAula", idxKey(modalidadeId, tema));
  const snap = await getDoc(ref);
  if (!snap.exists()) return false;
  const planoId = snap.data()?.planoId as string | undefined;
  return ignoreId ? planoId !== ignoreId : true;
}

export default function ModalPlanoAula({
  modo,
  planoInicial,
  onClose,
  onSaved,
}: ModalPlanoAulaProps) {
  const [modalidades, setModalidades] = useState<Modalidade[]>([]);
  const [modalidadeId, setModalidadeId] = useState(planoInicial?.modalidadeId || "");
  const [modalidadeNome, setModalidadeNome] = useState(planoInicial?.modalidadeNome || "");
  const [tema, setTema] = useState(planoInicial?.tema || "");
  const [atividades, setAtividades] = useState(planoInicial?.atividades || "");
  const [ativo, setAtivo] = useState<boolean>(planoInicial?.ativo ?? true);

  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    (async () => {
      const snap = await getDocs(collection(db, "modalidades"));
      const arr: Modalidade[] = [];
      snap.forEach((d) => {
        const x: any = d.data();
        if (x?.ativo !== false) {
          arr.push({ id: d.id, nome: x?.nome ?? "", ativo: x?.ativo ?? true });
        }
      });
      arr.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }));
      setModalidades(arr);

      if (!modalidadeId && arr.length) {
        setModalidadeId(arr[0].id);
        setModalidadeNome(arr[0].nome);
      }
    })();
  }, []); // eslint-disable-line

  useEffect(() => {
    const m = modalidades.find((m) => m.id === modalidadeId);
    setModalidadeNome(m?.nome || "");
  }, [modalidadeId, modalidades]);

  async function handleSalvar(e: React.FormEvent) {
    e.preventDefault();
    if (salvando) return;
    setErro("");

    const temaNorm = norm(tema);
    const atividadesNorm = norm(atividades);
    if (!modalidadeId) return setErro("Selecione a modalidade.");
    if (!temaNorm) return setErro("Informe o tema (título).");
    if (!atividadesNorm) return setErro("Informe as atividades.");

    try {
      setSalvando(true);

      // UX check
      const exists = await temaJaExiste(modalidadeId, temaNorm, planoInicial?.id);
      if (exists) {
        setSalvando(false);
        return setErro("Já existe um plano com este tema na mesma modalidade.");
      }

      if (modo === "novo") {
        const refPlano = doc(collection(db, "planosAula"));
        const refIdx = doc(db, "index_planosAula", idxKey(modalidadeId, temaNorm));
        const now = serverTimestamp();

        await runTransaction(db, async (tx) => {
          const idxSnap = await tx.get(refIdx);
          if (idxSnap.exists()) throw new Error("PLANO_TAKEN");

          tx.set(refIdx, {
            planoId: refPlano.id,
            modalidadeId,
            tema: temaNorm,
            temaLower: keyLower(temaNorm),
            criadoEm: now,
            atualizadoEm: now,
          });

          tx.set(refPlano, {
            modalidadeId,
            modalidadeNome,
            tema: temaNorm,
            temaLower: keyLower(temaNorm),
            atividades: atividadesNorm,
            ativo,
            criadoEm: now,
            atualizadoEm: now,
          });
        });

        onSaved({
          id: refPlano.id,
          modalidadeId,
          modalidadeNome,
          tema: temaNorm,
          atividades: atividadesNorm,
          ativo,
        });
        onClose();
      } else if (planoInicial?.id) {
        const refPlano = doc(db, "planosAula", planoInicial.id);
        const now = serverTimestamp();
        const mudouTema = keyLower(planoInicial.tema) !== keyLower(temaNorm);
        const mudouMod = planoInicial.modalidadeId !== modalidadeId;

        if (!mudouTema && !mudouMod) {
          await runTransaction(db, async (tx) => {
            const snap = await tx.get(refPlano);
            if (!snap.exists()) throw new Error("PLANO_NOT_FOUND");
            tx.update(refPlano, {
              modalidadeId,
              modalidadeNome,
              tema: temaNorm,
              temaLower: keyLower(temaNorm),
              atividades: atividadesNorm,
              ativo,
              atualizadoEm: now,
            });
          });
        } else {
          const refOldIdx = doc(db, "index_planosAula", idxKey(planoInicial.modalidadeId, planoInicial.tema));
          const refNewIdx = doc(db, "index_planosAula", idxKey(modalidadeId, temaNorm));

          await runTransaction(db, async (tx) => {
            const oldIdx = await tx.get(refOldIdx);
            if (!oldIdx.exists()) throw new Error("OLD_INDEX_NOT_FOUND");
            if (oldIdx.data()?.planoId !== planoInicial.id) throw new Error("INDEX_MISMATCH");

            const newIdx = await tx.get(refNewIdx);
            if (newIdx.exists()) throw new Error("PLANO_TAKEN");

            const planoSnap = await tx.get(refPlano);
            if (!planoSnap.exists()) throw new Error("PLANO_NOT_FOUND");

            tx.set(refNewIdx, {
              planoId: planoInicial.id,
              modalidadeId,
              tema: temaNorm,
              temaLower: keyLower(temaNorm),
              atualizadoEm: now,
            });

            tx.delete(refOldIdx);

            tx.update(refPlano, {
              modalidadeId,
              modalidadeNome,
              tema: temaNorm,
              temaLower: keyLower(temaNorm),
              atividades: atividadesNorm,
              ativo,
              atualizadoEm: now,
            });
          });
        }

        onSaved({
          id: planoInicial.id,
          modalidadeId,
          modalidadeNome,
          tema: temaNorm,
          atividades: atividadesNorm,
          ativo,
        });
        onClose();
      }
    } catch (e: any) {
      console.error(e);
      if (e?.message === "PLANO_TAKEN") setErro("Já existe um plano com este tema na modalidade.");
      else setErro("Erro ao salvar plano.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            {modo === "novo" ? "Novo plano de aula" : "Editar plano de aula"}
          </h2>
          <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-800">✕</button>
        </div>

        <form onSubmit={handleSalvar} className="space-y-4">
          <div className="flex flex-col">
            <label className="text-sm font-medium text-gray-700">Modalidade *</label>
            <select
              className="border rounded-xl p-3 text-sm"
              value={modalidadeId}
              onChange={(e) => setModalidadeId(e.target.value)}
            >
              {modalidades.map((m) => (
                <option key={m.id} value={m.id}>{m.nome}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col">
            <label className="text-sm font-medium text-gray-700">Tema (título) *</label>
            <input
              className="border rounded-xl p-3 text-sm"
              value={tema}
              onChange={(e) => setTema(e.target.value)}
              placeholder="Ex.: Forehand em Movimento"
              required
            />
          </div>

          <div className="flex flex-col">
            <label className="text-sm font-medium text-gray-700">Atividades *</label>
            <textarea
              className="border rounded-xl p-3 text-sm"
              rows={6}
              value={atividades}
              onChange={(e) => setAtividades(e.target.value)}
              placeholder="Descreva a sequência de exercícios / tarefas..."
              required
            />
          </div>

          <div className="flex items-center gap-2">
            <input id="ativo" type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
            <label htmlFor="ativo" className="text-sm text-gray-700">Ativo</label>
          </div>

          {erro && <div className="text-red-600 text-sm font-medium">{erro}</div>}

          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="flex-1 bg-gray-200 text-gray-700 rounded-xl px-4 py-3 text-sm font-semibold hover:bg-gray-300">
              Cancelar
            </button>
            <button type="submit" disabled={salvando} className="flex-1 bg-black text-white rounded-xl px-4 py-3 text-sm font-semibold hover:bg-gray-800 disabled:opacity-50">
              {salvando ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
