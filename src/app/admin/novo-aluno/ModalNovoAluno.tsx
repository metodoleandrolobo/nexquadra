//src/app/admin/novo-aluno/ModalNovoAluno.tsx
"use client";

import React, { useMemo, useState } from "react";
import { addDoc, collection } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import type { Aluno } from "../types"; // ✅ use o tipo central

type Responsavel = {
  id: string;
  nome: string;
  ativo: boolean;
};

type Familia = {
  responsavel: Responsavel;
  alunos: { id: string; nome: string; status: "ativo" | "inativo" }[];
};

type Props = {
  familias: Familia[];
  onClose: () => void;
  onSaved: (alunoSalvo: Aluno) => void; // ✅ agora usa Aluno
};

export default function ModalNovoAluno({ familias, onClose, onSaved }: Props) {
  const responsaveisAtivos = useMemo(
    () =>
      familias
        .filter((f) => f.responsavel?.ativo === true)
        .map((f) => f.responsavel)
        .sort((a, b) =>
          a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" })
        ),
    [familias]
  );

  const [responsavelId, setResponsavelId] = useState<string>("");
  const [buscaResp, setBuscaResp] = useState("");

  const [nome, setNome] = useState("");
  const [cpf, setCpf] = useState("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");
  const [nascimento, setNascimento] = useState("");

  const [cep, setCep] = useState("");
  const [endereco, setEndereco] = useState("");
  const [numero, setNumero] = useState("");
  const [complemento, setComplemento] = useState("");

  const [observacoes, setObservacoes] = useState("");

  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const responsaveisFiltrados = useMemo(() => {
    const termo = buscaResp.trim().toLowerCase();
    if (!termo) return responsaveisAtivos;
    return responsaveisAtivos.filter((r) =>
      r.nome.toLowerCase().includes(termo)
    );
  }, [buscaResp, responsaveisAtivos]);

  async function salvar() {
    if (!responsavelId) {
      setErro("Selecione o responsável.");
      return;
    }
    if (!nome.trim()) {
      setErro("Informe o nome do aluno.");
      return;
    }

    try {
      setErro("");
      setSalvando(true);

      async function buscarEnderecoPorCepAluno() {
      setErro("");
      const cepLimpo = cep.replace(/\D/g, "");

      if (cepLimpo.length !== 8) {
        setErro("CEP inválido. Use o formato 00000-000.");
        return;
      }

      try {
        const res = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`);
        const data = await res.json();

        if (data.erro) {
          setErro("CEP não encontrado.");
          return;
        }

        const montado = `${data.logradouro || ""}, ${data.bairro || ""}, ${
          data.localidade || ""
        } - ${data.uf || ""}`.trim();

        setEndereco(montado);
      } catch (e) {
        console.error(e);
        setErro("Não foi possível buscar o CEP agora.");
      }
    }

      // ✅ grava no Firestore sem o id
      const payload: Omit<Aluno, "id"> = {
        nome: nome.trim(),
        status: "ativo", // sempre ativo como você definiu
        responsavelId,
      };

      // só adiciona se tiver valor
      if (nascimento) payload.nascimento = nascimento;
      if (telefone) payload.telefone = telefone;
      if (cpf) payload.cpf = cpf;
      if (email) payload.email = email;
      if (cep) payload.cep = cep;
      if (endereco) payload.endereco = endereco;
      if (numero) payload.numero = numero;
      if (complemento) payload.complemento = complemento;
      if (observacoes) payload.observacoes = observacoes;


      const ref = await addDoc(collection(db, "alunos"), payload);

      // ✅ devolve para o pai já com o id
      onSaved({ ...payload, id: ref.id });
      onClose();
    } catch (e) {
      console.error(e);
      setErro("Erro ao salvar aluno.");
    } finally {
      setSalvando(false);
    }
  }

  const passoSelecionado = Boolean(responsavelId);

  async function buscarEnderecoPorCepAluno() {
  setErro("");
  const cepLimpo = cep.replace(/\D/g, "");

  if (cepLimpo.length !== 8) {
    setErro("CEP inválido. Use o formato 00000-000.");
    return;
  }

  try {
    const res = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`);
    const data = await res.json();

    if (data.erro) {
      setErro("CEP não encontrado.");
      return;
    }

    const montado = `${data.logradouro || ""}, ${data.bairro || ""}, ${
      data.localidade || ""
    } - ${data.uf || ""}`.trim();

    setEndereco(montado);
  } catch (e) {
    console.error(e);
    setErro("Não foi possível buscar o CEP agora.");
  }
}


  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Novo aluno</h2>
            <p className="text-[11px] text-gray-500 leading-snug">
              Primeiro selecione um responsável já cadastrado.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-xs text-gray-500 hover:text-gray-800"
          >
            ✕
          </button>
        </div>

        {/* PASSO 1 — Selecionar responsável (BUSCA + LISTA CLICÁVEL) */}
        <div className="space-y-2">
          <label className="text-xs text-gray-700 font-medium">
            Responsável
            <span className="block text-[10px] text-gray-500 font-normal">
              Lista mostra apenas responsáveis ativos
            </span>
          </label>

          {/* Barra de busca */}
          <div className="flex items-center gap-2">
            <input
              className="flex-1 border rounded-xl p-2 text-xs"
              placeholder="Pesquisar responsável..."
              value={buscaResp}
              onChange={(e) => setBuscaResp(e.target.value)}
            />
            {buscaResp && (
              <button
                className="text-[10px] px-2 py-1 rounded-lg bg-gray-200 text-gray-700 hover:bg-gray-300"
                onClick={() => setBuscaResp("")}
              >
                Limpar
              </button>
            )}
          </div>

          {/* Lista rolável e clicável (igual ao seletor de alunos) */}
          <div className="border rounded-xl max-h-40 overflow-auto p-2 space-y-2 bg-gray-50">
            {responsaveisFiltrados.length === 0 ? (
              <div className="text-[11px] text-gray-500 italic px-2 py-3 text-center">
                Nenhum responsável encontrado
              </div>
            ) : (
              responsaveisFiltrados.map((r) => {
                const selecionado = responsavelId === r.id;
                return (
                  <div
                    key={r.id}
                    onClick={() => setResponsavelId(r.id)}
                    className={`flex items-center justify-between text-xs px-3 py-2 rounded-xl border cursor-pointer transition
                      ${
                        selecionado
                          ? "bg-black text-white border-black"
                          : "bg-white text-gray-700 border-gray-300 hover:bg-gray-100"
                      }`}
                  >
                    <span className="font-medium">{r.nome}</span>
                    {selecionado && (
                      <span className="text-[10px] opacity-80">Selecionado</span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

{/* PASSO 2 — Formulário do aluno (aparece após selecionar responsável) */}
{passoSelecionado && (
  <>
    <hr className="my-2" />

    <div className="space-y-3 text-sm">
      {/* Nome (linha única) */}
      <div className="flex flex-col">
        <label className="text-xs text-gray-700 font-medium">
          Nome do aluno *
        </label>
        <input
          className="border rounded-xl p-2 text-sm"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Ex: Theo Santo"
        />
      </div>

      {/* Telefone e CPF (lado a lado) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="flex flex-col">
          <label className="text-xs text-gray-700 font-medium">
            Telefone (opcional)
          </label>
          <input
            className="border rounded-xl p-2 text-sm"
            value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
            placeholder="(11) 98888-7777"
          />
        </div>

        <div className="flex flex-col">
          <label className="text-xs text-gray-700 font-medium">
            CPF (opcional)
          </label>
          <input
            className="border rounded-xl p-2 text-sm"
            value={cpf}
            onChange={(e) => setCpf(e.target.value)}
            placeholder="000.000.000-00"
          />
        </div>
      </div>

      {/* Nascimento e Email (lado a lado) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="flex flex-col">
          <label className="text-xs text-gray-700 font-medium">
            Nascimento
          </label>
          <input
            type="date"
            className="border rounded-xl p-2 text-sm"
            value={nascimento}
            onChange={(e) => setNascimento(e.target.value)}
          />
        </div>

        <div className="flex flex-col">
          <label className="text-xs text-gray-700 font-medium">
            Email
          </label>
          <input
            type="email"
            className="border rounded-xl p-2 text-sm"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email@exemplo.com"
          />
        </div>
      </div>

      {/* CEP e botão buscar (lado a lado) */}
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end">
        <div className="flex flex-col">
          <label className="text-xs text-gray-700 font-medium">CEP</label>
          <input
            className="border rounded-xl p-2 text-sm"
            value={cep}
            onChange={(e) => setCep(e.target.value)}
            placeholder="00000-000"
          />
        </div>

        <button
          type="button"
          onClick={buscarEnderecoPorCepAluno}
          className="bg-black text-white rounded-xl px-3 py-2 text-xs hover:bg-gray-800 h-[38px]"
        >
          Buscar endereço
        </button>
      </div>

      {/* Rua / Bairro / Cidade - UF (linha única) */}
      <div className="flex flex-col">
        <label className="text-xs text-gray-700 font-medium">
          Rua / Bairro / Cidade - UF
        </label>
        <input
          className="border rounded-xl p-2 text-sm"
          value={endereco}
          onChange={(e) => setEndereco(e.target.value)}
          placeholder="Rua Tal, Bairro Tal, Cidade - UF"
        />
      </div>

      {/* Número e Complemento (lado a lado) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="flex flex-col">
          <label className="text-xs text-gray-700 font-medium">Número</label>
          <input
            className="border rounded-xl p-2 text-sm"
            value={numero}
            onChange={(e) => setNumero(e.target.value)}
            placeholder="123"
          />
        </div>

        <div className="flex flex-col">
          <label className="text-xs text-gray-700 font-medium">
            Complemento
          </label>
          <input
            className="border rounded-xl p-2 text-sm"
            value={complemento}
            onChange={(e) => setComplemento(e.target.value)}
            placeholder="Apto / Bloco..."
          />
        </div>
      </div>

      {/* Observações (como está) */}
      <div className="flex flex-col">
        <label className="text-xs text-gray-700 font-medium">
          Observações
        </label>
        <textarea
          className="border rounded-xl p-2 text-sm"
          rows={2}
          value={observacoes}
          onChange={(e) => setObservacoes(e.target.value)}
          placeholder="Ex: canhoto, nível intermediário, alergia..."
        />
      </div>
    </div>
  </>
)}

        {erro && <div className="text-red-600 text-xs font-medium">{erro}</div>}

        <div className="flex flex-col sm:flex-row gap-2 pt-2">
          <button
            onClick={onClose}
            className="flex-1 bg-gray-200 text-gray-700 rounded-xl px-4 py-2 text-xs font-semibold hover:bg-gray-300"
          >
            Cancelar
          </button>

          <button
            disabled={salvando || !passoSelecionado}
            onClick={salvar}
            className="flex-1 bg-black text-white rounded-xl px-4 py-2 text-xs font-semibold hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {salvando ? "Salvando..." : "Salvar aluno"}
          </button>
        </div>
      </div>
    </div>
  );
}
