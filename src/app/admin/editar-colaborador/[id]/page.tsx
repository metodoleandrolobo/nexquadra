//src/app/admin/editar-colaborador/[id]/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { db } from "../../../../lib/firebase";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { normalizeEmail } from "../../../../utils/normalize";
import { updateColaborador } from "../../colaboradores/service";


export default function EditarColaboradorPage() {
  const router = useRouter();
  const params = useParams();
  const id = String(params?.id || "");

  const [nome, setNome] = useState("");
  const [cpf, setCpf] = useState("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");
  const [funcao, setFuncao] = useState("");

  const [cep, setCep] = useState("");
  const [endereco, setEndereco] = useState("");
  const [numero, setNumero] = useState("");
  const [complemento, setComplemento] = useState("");

  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [buscandoCep, setBuscandoCep] = useState(false);

  const [erro, setErro] = useState("");
  const [msgOk, setMsgOk] = useState("");

  useEffect(() => {
    async function carregar() {
      try {
        const ref = doc(db, "professores", id);
        const snap = await getDoc(ref);

        if (!snap.exists()) {
          setErro("Colaborador não encontrado.");
          setCarregando(false);
          return;
        }

        const data = snap.data() as any;

        setNome(data.nome || "");
        setCpf(data.cpf || "");
        setTelefone(data.telefone || "");
        setEmail(data.email || "");
        setFuncao(data.funcao || "");
        setCep(data.cep || "");
        setEndereco(data.endereco || "");
        setNumero(data.numero || "");
        setComplemento(data.complemento || "");
      } catch (e) {
        console.error(e);
        setErro("Erro ao carregar informações.");
      } finally {
        setCarregando(false);
      }
    }

    if (id) carregar();
  }, [id]);

  async function buscarEnderecoPorCep() {
    setErro("");
    setMsgOk("");

    const cepLimpo = cep.replace(/\D/g, "");
    if (cepLimpo.length !== 8) {
      setErro("CEP inválido. Use o formato 00000-000.");
      return;
    }

    try {
      setBuscandoCep(true);
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
      setErro("");
      setMsgOk("Endereço preenchido pelo CEP 😉");
    } catch (err) {
      console.error(err);
      setErro("Não foi possível buscar o CEP agora.");
    } finally {
      setBuscandoCep(false);
    }
  }

async function salvar(e: React.FormEvent) {
  e.preventDefault();
  setErro("");
  setMsgOk("");

  try {
    setSalvando(true);

    await updateColaborador(id, {
      telefone: telefone.trim(),
      email, // normalização acontece no service (normalizeEmail)
      funcao: funcao.trim(),
      cep: cep.trim(),
      endereco: endereco.trim(),
      numero: numero.trim(),
      complemento: complemento.trim(),
    });

    setMsgOk("Alterações salvas com sucesso!");
    router.push("/painel");
  } catch (err: any) {
    console.error(err);
    setErro(err?.message || "Erro ao salvar alterações.");
  } finally {
    setSalvando(false);
  }
}




  if (carregando) {
    return (
      <main className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-gray-600 text-sm">Carregando dados...</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow p-6 space-y-8">
        {/* Cabeçalho */}
        <header className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">
              Editar Colaborador
            </h1>
            <p className="text-sm text-gray-600">
              Atualize os dados de contato, função e endereço.
            </p>
          </div>

          <button
            className="text-sm text-gray-500 hover:text-gray-800"
            onClick={() => router.push("/painel")}
          >
            ← Voltar
          </button>
        </header>

        <form onSubmit={salvar} className="space-y-8">
          {/* Dados principais */}
          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-800">
              Dados do colaborador
            </h2>

            {/* Nome / CPF */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col">
                <label className="text-sm text-gray-700 font-medium">
                  Nome completo
                </label>
                <input
                  className="border rounded-xl p-3 text-sm bg-gray-100 text-gray-700"
                  value={nome}
                  readOnly
                />
                <p className="text-[11px] text-gray-500 mt-1">
                  O nome não pode ser alterado.
                </p>
              </div>

              <div className="flex flex-col">
                <label className="text-sm text-gray-700 font-medium">
                  CPF
                </label>
                <input
                  className="border rounded-xl p-3 text-sm bg-gray-100 text-gray-700"
                  value={cpf}
                  readOnly
                />
                <p className="text-[11px] text-gray-500 mt-1">
                  O CPF não pode ser alterado.
                </p>
              </div>
            </div>

            {/* Telefone / Email */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col">
                <label className="text-sm text-gray-700 font-medium">
                  Telefone
                </label>
                <input
                  className="border rounded-xl p-3 text-sm"
                  value={telefone}
                  onChange={(e) => setTelefone(e.target.value)}
                  placeholder="(16) 99999-0000"
                />
              </div>

              <div className="flex flex-col">
                <label className="text-sm text-gray-700 font-medium">
                  Email do colaborador
                </label>
                <input
                  type="email"
                  className="border rounded-xl p-3 text-sm"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={(e) => setEmail(normalizeEmail(e.target.value))}
                />
                <p className="text-[11px] text-gray-500 mt-1">
                  Esse email é usado no login do colaborador.
                </p>
              </div>
            </div>

            {/* Função */}
            <div className="flex flex-col">
              <label className="text-sm text-gray-700 font-medium">
                Função / Perfil de acesso
              </label>
              <select
                  className="border rounded-xl p-3 text-sm"
                  value={funcao}
                  onChange={(e) => setFuncao(e.target.value)}
                >
                  <option value="">Selecione uma função...</option>
                  <option value="gestor">Gestor</option>
                  <option value="coordenador">Coordenador</option>
                  <option value="professores">Professor</option>
                  <option value="secretaria">Secretaria</option>
                </select>
                <p className="text-[11px] text-gray-500 mt-1">
                  Essa função define o tipo de acesso do colaborador no NexQuadra.
                </p>
              </div>

            {/* CEP + Buscar endereço */}
            <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
              <div className="flex flex-col">
                <label className="text-sm text-gray-700 font-medium">
                  CEP
                </label>
                <input
                  className="border rounded-xl p-3 text-sm"
                  value={cep}
                  onChange={(e) => setCep(e.target.value)}
                  placeholder="00000-000"
                />
              </div>

              <div className="flex flex-col">
                <label className="text-sm text-gray-700 font-medium invisible">
                  Buscar endereço
                </label>
                <button
                  type="button"
                  onClick={buscarEnderecoPorCep}
                  disabled={buscandoCep}
                  className="bg-black text-white rounded-xl px-4 py-3 text-sm hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {buscandoCep ? "Buscando..." : "Buscar endereço"}
                </button>
              </div>
            </div>

            {/* Endereço completo */}
            <div className="flex flex-col">
              <label className="text-sm text-gray-700 font-medium">
                Rua / Bairro / Cidade - UF
              </label>
              <input
                className="border rounded-xl p-3 text-sm"
                value={endereco}
                onChange={(e) => setEndereco(e.target.value)}
                placeholder="Rua Tal, Bairro Tal, Cidade - UF"
              />
            </div>

            {/* Número / Complemento */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col">
                <label className="text-sm text-gray-700 font-medium">
                  Número
                </label>
                <input
                  className="border rounded-xl p-3 text-sm"
                  value={numero}
                  onChange={(e) => setNumero(e.target.value)}
                  placeholder="123"
                />
              </div>

              <div className="flex flex-col">
                <label className="text-sm text-gray-700 font-medium">
                  Complemento
                </label>
                <input
                  className="border rounded-xl p-3 text-sm"
                  value={complemento}
                  onChange={(e) => setComplemento(e.target.value)}
                  placeholder="Apto / Bloco / Casa dos fundos..."
                />
              </div>
            </div>
          </section>

          {erro && (
            <div className="text-red-600 text-sm font-medium">
              {erro}
            </div>
          )}
          {msgOk && (
            <div className="text-green-600 text-sm font-medium">
              {msgOk}
            </div>
          )}

          <button
            type="submit"
            disabled={salvando}
            className="w-full bg-black text-white rounded-xl px-4 py-3 text-sm font-semibold hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {salvando ? "Salvando..." : "Salvar alterações"}
          </button>
        </form>
      </div>
    </main>
  );
}
