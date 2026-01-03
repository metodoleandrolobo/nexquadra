"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { db } from "../../../../lib/firebase";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { updateResponsavel } from "../../responsavel/service";
import { normalizeCpf, normalizeEmail } from "../../../../utils/normalize";


export default function EditarResponsavelPage() {
  const router = useRouter();
  const params = useParams();
  const id = String(params?.id || "");

  // campos do formulário
  const [nomeResp, setNomeResp] = useState("");
  const [cpf, setCpf] = useState("");
  const [telefoneResp, setTelefoneResp] = useState("");
  const [email, setEmail] = useState("");
  const [cep, setCep] = useState("");
  const [endereco, setEndereco] = useState("");
  const [numero, setNumero] = useState("");
  const [complemento, setComplemento] = useState("");

  // estados de controle
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [buscandoCep, setBuscandoCep] = useState(false);

  const [erro, setErro] = useState("");
  const [msgOk, setMsgOk] = useState("");
  const [emailResp, setEmailResp] = useState("");



  // carregar dados iniciais do responsável
  useEffect(() => {
    async function carregar() {
      try {
        const ref = doc(db, "responsaveis", id);
        const snap = await getDoc(ref);

        if (!snap.exists()) {
          setErro("Responsável não encontrado.");
          setCarregando(false);
          return;
        }

        const data = snap.data() as any;

        setNomeResp(data.nome || "");
        setCpf(data.cpf || "");
        setTelefoneResp(data.telefone || "");
        setEmailResp(data.email || "");
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

    if (id) {
      carregar();
    }
  }, [id]);

  // buscar endereço pelo CEP (ViaCEP)
  async function buscarEnderecoPorCep() {
    setErro("");
    setMsgOk("");

    // sanitiza CEP para só dígitos, ex: "12345-678" -> "12345678"
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

      // Monta endereço no mesmo formato da tela de cadastro:
      // "Rua Tal, Bairro Tal, Cidade Tal - UF"
      const montado = `${data.logradouro || ""}, ${data.bairro || ""}, ${data.localidade || ""} - ${data.uf || ""}`.trim();

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

  // salvar alterações no Firestore
  async function salvarAlteracoes(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setMsgOk("");
    setSalvando(true);

    try {
      const ref = doc(db, "responsaveis", id);
      await updateDoc(ref, {
        telefone: telefoneResp,
        email,
        cep,
        endereco,
        numero,
        complemento,
        // nome e cpf não mudam
      });

      setMsgOk("Alterações salvas com sucesso!");
    } catch (err) {
      console.error(err);
      setErro("Erro ao salvar alterações.");
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

async function salvar(e: React.FormEvent) {
  e.preventDefault();
  setErro("");

  const dto = {
    nome: nomeResp.trim(),
    cpf: normalizeCpf(cpf),
    telefone: telefoneResp.trim(),
    email: normalizeEmail(emailResp),
    cep: cep.trim(),
    endereco: endereco.trim(),
    numero: numero.trim(),
    complemento: complemento.trim(),
  };

  try {
    setSalvando(true);
    await updateResponsavel(id, dto); // <- usa o service aqui
    setMsgOk("Alterações salvas com sucesso!");
    router.push("/painel");
  } catch (e: any) {
    console.error(e);
    setErro(e?.message || "Erro ao salvar.");
  } finally {
    setSalvando(false);
  }
}
  
  return (
    <main className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow p-6 space-y-8">
        {/* Cabeçalho */}
        <header className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">
              Editar Responsável / Família
            </h1>
            <p className="text-sm text-gray-600">
              Atualize os dados de contato e endereço do responsável.
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
          {/* Dados do responsável */}
          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-800">
              Dados do responsável
            </h2>

            {/* Nome completo / CPF */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col">
                <label className="text-sm text-gray-700 font-medium">
                  Nome completo
                </label>
                <input
                  className="border rounded-xl p-3 text-sm bg-gray-100 text-gray-700"
                  value={nomeResp}
                  readOnly
                  placeholder="Ex: Tiago Santo"
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
                  placeholder="000.000.000-00"
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
                  value={telefoneResp}
                  onChange={(e) => setTelefoneResp(e.target.value)}
                  placeholder="(11) 99999-0000"
                />
              </div>

              <div className="flex flex-col">
                <label className="text-sm text-gray-700 font-medium">
                  Email do responsável
                </label>
                <input
  type="email"
  className="border rounded-xl p-3 text-sm"
  value={emailResp}
  onChange={(e) => setEmailResp(e.target.value)}
  onBlur={(e) => setEmailResp(normalizeEmail(e.target.value))}
/>
                <p className="text-[11px] text-gray-500 mt-1">
                  Esse email pode ser usado depois para o login do responsável.
                </p>
              </div>
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

          {/* mensagens de feedback */}
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

          {/* botão salvar */}
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
