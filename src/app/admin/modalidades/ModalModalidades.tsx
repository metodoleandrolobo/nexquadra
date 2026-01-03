//src/app/admin/modalidades/ModalModalidades.tsx
"use client";

import { useEffect, useState } from "react";
import {
  listModalidades,
  createModalidade,
  updateModalidade,
  deleteModalidade,
  Modalidade,
} from "./service";

type Props = {
  onClose: () => void;
  onChanged?: (items: Modalidade[]) => void; // opcional: atualizar lista no pai
};

export default function ModalModalidades({ onClose, onChanged }: Props) {
  const [carregando, setCarregando] = useState(true);
  const [lista, setLista] = useState<Modalidade[]>([]);
  const [novoNome, setNovoNome] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function carregar() {
    setCarregando(true);
    try {
      const data = await listModalidades();
      setLista(data);
      onChanged?.(data);
    } catch (e) {
      console.error(e);
      setErro("Não foi possível carregar as modalidades.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function addNova() {
    setErro("");
    const nome = novoNome.trim();
    if (!nome) {
      setErro("Informe um nome para a modalidade.");
      return;
    }
    try {
      setSalvando(true);
      await createModalidade(nome);
      setNovoNome("");
      await carregar();
    } catch (e: any) {
      console.error(e);
      setErro(e?.message || "Erro ao criar modalidade.");
    } finally {
      setSalvando(false);
    }
  }

  async function toggleAtivo(m: Modalidade) {
    try {
      await updateModalidade(m.id, { ativo: !m.ativo });
      await carregar();
    } catch (e) {
      console.error(e);
      setErro("Erro ao alterar status.");
    }
  }

  async function salvarNome(id: string, nome: string) {
    const n = nome.trim();
    if (!n) return;
    try {
      await updateModalidade(id, { nome: n });
      await carregar();
    } catch (e) {
      console.error(e);
      setErro("Erro ao renomear.");
    }
  }

  async function remover(id: string) {
    const ok = confirm("Excluir esta modalidade? Esta ação não pode ser desfeita.");
    if (!ok) return;
    try {
      await deleteModalidade(id);
      await carregar();
    } catch (e) {
      console.error(e);
      setErro("Erro ao excluir.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl p-6 space-y-5">
        {/* header */}
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Modalidades</h2>
            <p className="text-[11px] text-gray-500">Crie, edite e ative/desative modalidades.</p>
          </div>
          <button onClick={onClose} className="text-xs text-gray-500 hover:text-gray-800">✕</button>
        </div>

        {/* nova */}
        <div className="flex gap-2">
          <input
            className="flex-1 border rounded-xl p-2 text-sm"
            placeholder="ex.: Tênis Infantil, Beach Tennis, Padel..."
            value={novoNome}
            onChange={(e) => setNovoNome(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addNova(); }}
          />
          <button
            onClick={addNova}
            disabled={salvando}
            className="bg-black text-white rounded-xl px-4 py-2 text-sm hover:bg-gray-800 disabled:opacity-50"
          >
            {salvando ? "Salvando..." : "Adicionar"}
          </button>
        </div>

        {erro && <div className="text-xs text-red-600">{erro}</div>}

        {/* lista */}
        <div className="border rounded-xl">
          {carregando ? (
            <div className="p-4 text-sm text-gray-500">Carregando...</div>
          ) : lista.length === 0 ? (
            <div className="p-4 text-sm text-gray-500">Nenhuma modalidade ainda.</div>
          ) : (
            <ul className="divide-y">
              {lista.map((m) => (
                <li key={m.id} className="p-3 flex items-center gap-3">
                  <input
                    defaultValue={m.nome}
                    onBlur={(e) => salvarNome(m.id, e.target.value)}
                    className="flex-1 border rounded-xl px-3 py-2 text-sm"
                  />
                  <span
                    className={`text-[10px] px-2 py-1 rounded-lg uppercase tracking-wide ${
                      m.ativo ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-700"
                    }`}
                  >
                    {m.ativo ? "ATIVO" : "INATIVO"}
                  </span>
                  <button
                    onClick={() => toggleAtivo(m)}
                    className="text-xs border rounded-xl px-3 py-2 hover:bg-gray-50"
                  >
                    {m.ativo ? "Inativar" : "Ativar"}
                  </button>
                  <button
                    onClick={() => remover(m.id)}
                    className="text-xs bg-red-600 text-white rounded-xl px-3 py-2 hover:bg-red-700"
                  >
                    Excluir
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* footer */}
        <div className="text-right">
          <button onClick={onClose} className="border rounded-xl px-4 py-2 text-sm hover:bg-gray-50">
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
