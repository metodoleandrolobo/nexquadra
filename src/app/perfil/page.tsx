"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { db } from "../../lib/firebase";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { normalizeEmail } from "../../utils/normalize";

type PerfilTipo = "gestor" | "responsavel" | "colaborador";

type PerfilDados = {
  nome: string;
  cpf: string;
  telefone?: string;
  email?: string;
  cep?: string;
  endereco?: string;
  numero?: string;
  complemento?: string;
};

function getCollectionByTipo(tipo: PerfilTipo): string {
  if (tipo === "gestor") return "users";
  if (tipo === "colaborador") return "professores";
  return "responsaveis";
}

export default function PerfilPage() {
  const router = useRouter();

  const [tipoPerfil, setTipoPerfil] = useState<PerfilTipo | null>(null);
  const [perfilId, setPerfilId] = useState<string | null>(null);

  // campos
  const [nome, setNome] = useState("");
  const [cpf, setCpf] = useState("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");
  const [cep, setCep] = useState("");
  const [endereco, setEndereco] = useState("");
  const [numero, setNumero] = useState("");
  const [complemento, setComplemento] = useState("");

  // controle
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [erro, setErro] = useState("");
  const [msgOk, setMsgOk] = useState("");
  const [modoEdicao, setModoEdicao] = useState(false);

  // Carregar perfil logado a partir do localStorage
  useEffect(() => {
    async function carregarPerfil() {
      try {
        if (typeof window === "undefined") return;

        const tipo = localStorage.getItem("nexquadraPerfilTipo") as
          | PerfilTipo
          | null;
        const id = localStorage.getItem("nexquadraPerfilId");

        if (!tipo || !id) {
          setErro(
            "Não foi possível identificar o perfil logado. Faça login novamente."
          );
          setCarregando(false);
          return;
        }

        setTipoPerfil(tipo);
        setPerfilId(id);

        const collectionName = getCollectionByTipo(tipo);
        const ref = doc(db, collectionName, id);
        const snap = await getDoc(ref);

        if (!snap.exists()) {
          setErro("Dados do perfil não encontrados.");
          setCarregando(false);
          return;
        }

        const data = snap.data() as any;

        const dados: PerfilDados = {
          nome: data.nome || "",
          cpf: data.cpf || "",
          telefone: data.telefone || "",
          email: data.email || "",
          cep: data.cep || "",
          endereco: data.endereco || "",
          numero: data.numero || "",
          complemento: data.complemento || "",
        };

        setNome(dados.nome);
        setCpf(dados.cpf);
        setTelefone(dados.telefone || "");
        setEmail(dados.email || "");
        setCep(dados.cep || "");
        setEndereco(dados.endereco || "");
        setNumero(dados.numero || "");
        setComplemento(dados.complemento || "");
      } catch (e) {
        console.error(e);
        setErro("Erro ao carregar dados do perfil.");
      } finally {
        setCarregando(false);
      }
    }

    carregarPerfil();
  }, []);

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
      setMsgOk("Endereço preenchido pelo CEP 😉");
    } catch (err) {
      console.error(err);
      setErro("Não foi possível buscar o CEP agora.");
    } finally {
      setBuscandoCep(false);
    }
  }

 async function salvarAlteracoes(e: React.FormEvent) {
  e.preventDefault();
  setErro("");
  setMsgOk("");

  if (!perfilId || !tipoPerfil) {
    setErro("Perfil não identificado.");
    return;
  }

  try {
    setSalvando(true);

    const payload = {
      tipoPerfil,     // "gestor" | "professor" | "responsavel"
      perfilId,       // id do doc na coleção certa
      telefone: telefone.trim(),
      email: email.trim().toLowerCase(),
      cep: cep.trim(),
      endereco: endereco.trim(),
      numero: numero.trim(),
      complemento: complemento.trim(),
    };

    const resp = await fetch("/api/perfil/atualizar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    let data: any = null;
    try {
      data = await resp.json();
    } catch {
      // se não vier JSON, só ignora
    }

    if (!resp.ok) {
      const msg = data?.error || "Erro ao salvar alterações.";
      throw new Error(msg);
    }

    setMsgOk("Alterações salvas com sucesso!");
    setModoEdicao(false);
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
        <div className="text-gray-600 text-sm">Carregando dados do perfil...</div>
      </main>
    );
  }

  const tituloPorTipo =
    tipoPerfil === "gestor"
      ? "Perfil do Gestor"
      : tipoPerfil === "colaborador"
      ? "Perfil do Colaborador"
      : "Perfil do Responsável";

  return (
    <main className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow p-6 space-y-8">
        {/* Cabeçalho */}
        <header className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">
              {tituloPorTipo}
            </h1>
            <p className="text-sm text-gray-600">
              Visualize seus dados e, se precisar, atualize contato e endereço.
            </p>
          </div>

          <button
            className="text-sm text-gray-500 hover:text-gray-800"
            onClick={() => router.push("/painel")}
          >
            ← Voltar ao painel
          </button>
        </header>

        {/* FEEDBACK GLOBAL */}
        {(erro || msgOk) && (
          <div className="space-y-1">
            {erro && (
              <div className="text-red-600 text-sm font-medium">{erro}</div>
            )}
            {msgOk && (
              <div className="text-green-600 text-sm font-medium">{msgOk}</div>
            )}
          </div>
        )}

        {/* 🔹 MODO VISUALIZAÇÃO (sempre mostra) */}
        <section className="space-y-4 border border-gray-100 rounded-2xl p-4 bg-gray-50">
          <h2 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">
            Dados do perfil
          </h2>

          {/* Nome + CPF */}
          <div className="grid gap-4 sm:grid-cols-2 text-sm">
            <div>
              <div className="text-[11px] font-semibold text-gray-500 uppercase">
                Nome completo
              </div>
              <div className="text-gray-900">{nome || "-"}</div>
            </div>

            <div>
              <div className="text-[11px] font-semibold text-gray-500 uppercase">
                CPF
              </div>
              <div className="text-gray-900">{cpf || "-"}</div>
            </div>
          </div>

          {/* Contato */}
          <div className="grid gap-4 sm:grid-cols-2 text-sm">
            <div>
              <div className="text-[11px] font-semibold text-gray-500 uppercase">
                Telefone
              </div>
              <div className="text-gray-900">
                {telefone && telefone.trim() !== "" ? telefone : "-"}
              </div>
            </div>

            <div>
              <div className="text-[11px] font-semibold text-gray-500 uppercase">
                Email
              </div>
              <div className="text-gray-900">
                {email && email.trim() !== "" ? email : "-"}
              </div>
            </div>
          </div>

          {/* Endereço */}
          <div className="space-y-1 text-sm">
            <div className="text-[11px] font-semibold text-gray-500 uppercase">
              Endereço
            </div>
            {endereco ? (
              <>
                <div className="text-gray-900">{endereco}</div>
                <div className="text-gray-700">
                  {numero ? `Nº ${numero}` : ""}
                  {complemento
                    ? `${numero ? ", " : ""}${complemento}`
                    : ""}
                </div>
                {cep && (
                  <div className="text-gray-500 text-xs mt-1">
                    CEP: {cep}
                  </div>
                )}
              </>
            ) : (
              <div className="text-gray-500">Nenhum endereço cadastrado.</div>
            )}
          </div>

          {/* Botão para abrir painel de edição */}
          {!modoEdicao && (
            <div className="pt-2">
              <button
                type="button"
                onClick={() => {
                  setErro("");
                  setMsgOk("");
                  setModoEdicao(true);
                }}
                className="w-full sm:w-auto bg-black text-white rounded-xl px-4 py-2 text-sm font-semibold hover:bg-gray-800"
              >
                Editar perfil
              </button>
            </div>
          )}
        </section>

        {/* 🔹 MODO EDIÇÃO – painel aparece só quando clicar em Editar */}
        {modoEdicao && (
          <form
            onSubmit={salvarAlteracoes}
            className="space-y-6 border border-gray-200 rounded-2xl p-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">
                  Editar dados
                </h2>
                <p className="text-xs text-gray-500">
                  Altere apenas contato e endereço. Nome e CPF não podem ser editados.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setModoEdicao(false);
                  setErro("");
                  // mantém msgOk se tiver acabado de salvar
                }}
                className="text-xs text-gray-500 hover:text-gray-800"
              >
                ✕ Cancelar
              </button>
            </div>

            {/* Nome / CPF (somente leitura, de referência) */}
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
                  Nome não pode ser alterado aqui.
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
                  CPF não pode ser alterado.
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
                  placeholder="(11) 99999-0000"
                />
              </div>

              <div className="flex flex-col">
                <label className="text-sm text-gray-700 font-medium">
                  Email
                </label>
                <input
                  type="email"
                  className="border rounded-xl p-3 text-sm"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={(e) => setEmail(normalizeEmail(e.target.value))}
                  placeholder="email@exemplo.com"
                />
                <p className="text-[11px] text-gray-500 mt-1">
                  Esse email poderá ser usado para comunicação e acesso.
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

            {/* Endereço */}
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

            {/* Botões */}
            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setModoEdicao(false);
                }}
                className="flex-1 bg-gray-200 text-gray-700 rounded-xl px-4 py-3 text-sm font-semibold hover:bg-gray-300"
              >
                Cancelar
              </button>

              <button
                type="submit"
                disabled={salvando}
                className="flex-1 bg-black text-white rounded-xl px-4 py-3 text-sm font-semibold hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {salvando ? "Salvando..." : "Salvar alterações"}
              </button>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
