"use client";

import React, { useEffect, useState } from "react";
import { db } from "../../../lib/firebase";
import {
  collection,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";

export type PermissoesPerfil = {
  // você pode expandir depois
  gerenciarAulas: boolean;
  gerenciarProfessores: boolean;
  gerenciarResponsaveis: boolean;
  gerenciarFinanceiro: boolean;
  verRelatorios: boolean;
  configurarSistema: boolean;
};

export type Perfil = {
  id: string;
  nome: string;
  slug: string;
  slugLower: string;
  permissoes: PermissoesPerfil;
  ativo: boolean;
};

export type ModalPerfilProps = {
  modo: "novo" | "editar";
  perfilInicial?: Perfil | null;
  onClose: () => void;
  onSaved: (perfilSalvo: Perfil) => void;
};

// helpers
function normalize(v: string) {
  return (v || "").trim();
}
function toSlug(v: string) {
  return normalize(v)
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function slugJaExiste(slugLower: string, ignoreId?: string) {
  // índice manual: index_perfis/{slugLower} => { perfilId }
  const idxRef = doc(db, "index_perfis", slugLower);
  const snap = await getDoc(idxRef);
  if (!snap.exists()) return false;
  const perfilId = snap.data()?.perfilId as string | undefined;
  return ignoreId ? perfilId !== ignoreId : true;
}

const defaultPermissoes: PermissoesPerfil = {
  gerenciarAulas: false,
  gerenciarProfessores: false,
  gerenciarResponsaveis: false,
  gerenciarFinanceiro: false,
  verRelatorios: false,
  configurarSistema: false,
};

export default function ModalPerfil({
  modo,
  perfilInicial,
  onClose,
  onSaved,
}: ModalPerfilProps) {
  const [nome, setNome] = useState(perfilInicial?.nome ?? "");
  const [slug, setSlug] = useState(perfilInicial?.slug ?? "");
  const [ativo, setAtivo] = useState<boolean>(perfilInicial?.ativo ?? true);
  const [permissoes, setPermissoes] = useState<PermissoesPerfil>(
    perfilInicial?.permissoes ?? defaultPermissoes
  );

  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  // se o usuário editar nome e slug estiver vazio (ou igual ao anterior), gerar slug automaticamente
  useEffect(() => {
    if (modo === "novo") {
      setSlug((prev) => (prev ? prev : toSlug(nome)));
    }
  }, [nome, modo]);

  function togglePermissao(key: keyof PermissoesPerfil) {
    setPermissoes((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function handleSalvar(e: React.FormEvent) {
    e.preventDefault();
    if (salvando) return;
    setErro("");

    const nomeNorm = normalize(nome);
    const slugNorm = toSlug(slug || nomeNorm);
    const slugLower = slugNorm.toLowerCase();
    if (!nomeNorm) return setErro("Informe o nome do perfil.");
    if (!slugLower) return setErro("Informe o slug do perfil.");

    try {
      setSalvando(true);

      // checagem UX prévia
      const exists = await slugJaExiste(slugLower, perfilInicial?.id);
      if (exists) {
        setSalvando(false);
        return setErro("Já existe um perfil com este slug.");
      }

      if (modo === "novo") {
        const refPerfil = doc(collection(db, "perfis")); // novo id
        const idxRef = doc(db, "index_perfis", slugLower);
        const now = serverTimestamp();

        await runTransaction(db, async (tx) => {
          // read índice
          const idxSnap = await tx.get(idxRef);
          if (idxSnap.exists()) throw new Error("SLUG_TAKEN");

          // write índice
          tx.set(idxRef, {
            perfilId: refPerfil.id,
            slug: slugNorm,
            slugLower,
            criadoEm: now,
            atualizadoEm: now,
          });

          // write perfil
          tx.set(refPerfil, {
            nome: nomeNorm,
            slug: slugNorm,
            slugLower,
            permissoes,
            ativo,
            criadoEm: now,
            atualizadoEm: now,
          });
        });

        onSaved({
          id: refPerfil.id,
          nome: nomeNorm,
          slug: slugNorm,
          slugLower,
          permissoes,
          ativo,
        });
        onClose();
      } else if (perfilInicial?.id) {
        const refPerfil = doc(db, "perfis", perfilInicial.id);
        const now = serverTimestamp();
        const mudouSlug = (perfilInicial.slugLower || "") !== slugLower;

        if (!mudouSlug) {
          // apenas update
          await runTransaction(db, async (tx) => {
            const snap = await tx.get(refPerfil);
            if (!snap.exists()) throw new Error("PERFIL_NOT_FOUND");
            tx.update(refPerfil, {
              nome: nomeNorm,
              slug: slugNorm,
              slugLower,
              permissoes,
              ativo,
              atualizadoEm: now,
            });
          });
        } else {
          // precisa trocar índice
          const oldIdxRef = doc(db, "index_perfis", perfilInicial.slugLower);
          const newIdxRef = doc(db, "index_perfis", slugLower);

          await runTransaction(db, async (tx) => {
            const oldIdx = await tx.get(oldIdxRef);
            if (!oldIdx.exists()) throw new Error("OLD_INDEX_NOT_FOUND");
            if (oldIdx.data()?.perfilId !== perfilInicial.id)
              throw new Error("INDEX_MISMATCH");

            const newIdx = await tx.get(newIdxRef);
            if (newIdx.exists()) throw new Error("SLUG_TAKEN");

            const perfilSnap = await tx.get(refPerfil);
            if (!perfilSnap.exists()) throw new Error("PERFIL_NOT_FOUND");

            tx.set(newIdxRef, {
              perfilId: perfilInicial.id,
              slug: slugNorm,
              slugLower,
              atualizadoEm: now,
            });

            tx.delete(oldIdxRef);

            tx.update(refPerfil, {
              nome: nomeNorm,
              slug: slugNorm,
              slugLower,
              permissoes,
              ativo,
              atualizadoEm: now,
            });
          });
        }

        onSaved({
          id: perfilInicial.id,
          nome: nomeNorm,
          slug: slugNorm,
          slugLower,
          permissoes,
          ativo,
        });
        onClose();
      }
    } catch (e: any) {
      console.error(e);
      if (e?.message === "SLUG_TAKEN") setErro("Já existe um perfil com este slug.");
      else setErro("Erro ao salvar perfil.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            {modo === "novo" ? "Novo perfil" : "Editar perfil"}
          </h2>
          <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-800">
            ✕
          </button>
        </div>

        <form onSubmit={handleSalvar} className="space-y-4">
          <div className="flex flex-col">
            <label className="text-sm font-medium text-gray-700">Nome *</label>
            <input
              className="border rounded-xl p-3 text-sm"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex.: Gestor, Professor, Responsável"
              required
            />
          </div>

          <div className="flex flex-col">
            <label className="text-sm font-medium text-gray-700">Slug *</label>
            <input
              className="border rounded-xl p-3 text-sm"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="gestor, professor, responsavel"
              required
            />
            <span className="text-[11px] text-gray-500 mt-1">
              Usado para unicidade e regras. Somente letras/números/hífens.
            </span>
          </div>

          <fieldset className="border rounded-xl p-3">
            <legend className="text-sm font-medium text-gray-700 px-2">Permissões</legend>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={permissoes.gerenciarAulas}
                  onChange={() => togglePermissao("gerenciarAulas")}
                />
                Gerenciar aulas
              </label>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={permissoes.gerenciarProfessores}
                  onChange={() => togglePermissao("gerenciarProfessores")}
                />
                Gerenciar professores
              </label>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={permissoes.gerenciarResponsaveis}
                  onChange={() => togglePermissao("gerenciarResponsaveis")}
                />
                Gerenciar responsáveis
              </label>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={permissoes.gerenciarFinanceiro}
                  onChange={() => togglePermissao("gerenciarFinanceiro")}
                />
                Gerenciar financeiro
              </label>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={permissoes.verRelatorios}
                  onChange={() => togglePermissao("verRelatorios")}
                />
                Ver relatórios
              </label>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={permissoes.configurarSistema}
                  onChange={() => togglePermissao("configurarSistema")}
                />
                Configurar sistema
              </label>
            </div>
          </fieldset>

          <div className="flex items-center gap-2">
            <input
              id="ativo"
              type="checkbox"
              checked={ativo}
              onChange={(e) => setAtivo(e.target.checked)}
            />
            <label htmlFor="ativo" className="text-sm text-gray-700">Ativo</label>
          </div>

          {erro && <div className="text-red-600 text-sm font-medium">{erro}</div>}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-gray-200 text-gray-700 rounded-xl px-4 py-3 text-sm font-semibold hover:bg-gray-300"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={salvando}
              className="flex-1 bg-black text-white rounded-xl px-4 py-3 text-sm font-semibold hover:bg-gray-800 disabled:opacity-50"
            >
              {salvando ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
