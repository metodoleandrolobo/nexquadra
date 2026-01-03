//src/app/admin/novo-colaborador/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { db, auth } from "../../../lib/firebase";
import { addDoc, collection } from "firebase/firestore";
import { sendPasswordResetEmail } from "firebase/auth";

export default function NovoColaboradorPage() {
  const router = useRouter();

  const [nome, setNome] = useState("");
  const [cpf, setCpf] = useState("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");

  // agora funcao será sempre um destes:
  // "gestor" | "coordenador" | "professores" | "secretaria"
  const [funcao, setFuncao] = useState("");

  const [cep, setCep] = useState("");
  const [endereco, setEndereco] = useState("");
  const [numero, setNumero] = useState("");
  const [complemento, setComplemento] = useState("");

  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [msgOk, setMsgOk] = useState("");

  async function buscarEnderecoPorCep() {
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

  async function salvarCadastro(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setMsgOk("");

    if (!nome.trim()) return setErro("Informe o nome do colaborador.");
    if (!cpf.trim()) return setErro("Informe o CPF do colaborador.");
    if (!email.trim()) return setErro("Informe o email do colaborador.");
    if (!funcao.trim()) return setErro("Informe a função do colaborador.");

    try {
      setSalvando(true);

      const payload = {
        nome: nome.trim(),
        cpf: cpf.replace(/\D/g, ""),
        email: email.trim().toLowerCase(),
        telefone: telefone.trim(),

        // aqui vai exatamente: "coordenador" | "professores" | "secretaria"
        funcao: funcao.trim(),

        cep,
        endereco,
        numero,
        complemento,
      };

      // 1) Cria colaborador + user no Auth via API (Admin SDK)
      const resp = await fetch("/api/admin/colaboradores/novo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!resp.ok) {
        let msg = "Erro ao salvar colaborador.";
        try {
          const dataErr = await resp.json();
          if (dataErr?.error) msg = dataErr.error;
        } catch {
          // resposta não é JSON
        }
        throw new Error(msg);
      }

      const data = await resp.json(); // { ok, professorId, authUid }
      const professorId = data?.professorId as string | undefined;

      // 2) Enviar email para DEFINIR SENHA (igual RESPONSÁVEL)
      try {
        await sendPasswordResetEmail(auth, payload.email);
      } catch (err: any) {
        console.error("Erro ao enviar email de definição de senha:", err);
        setErro(
          "Colaborador criado, mas não foi possível enviar o email de definição de senha. Ele pode usar 'Esqueci minha senha' na tela de login."
        );
      }

      setMsgOk(
        "Colaborador cadastrado com sucesso! Enviamos um email para definir a senha."
      );

      router.push("/painel");
    } catch (e: any) {
      console.error(e);
      setErro(e?.message || "Erro ao salvar colaborador.");
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
              Novo Colaborador
            </h1>
            <p className="text-sm text-gray-600">
              Cadastre um novo colaborador.
            </p>
          </div>

          <button
            className="text-sm text-gray-500 hover:text-gray-800"
            onClick={() => router.push("/painel")}
          >
            ← Voltar
          </button>
        </header>

        <form className="space-y-10" onSubmit={salvarCadastro}>
          {/* Dados principais */}
          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-800">
              Dados do colaborador
            </h2>

            <div className="grid gap-4 sm:grid-cols-2">
              {/* Nome */}
              <div className="flex flex-col">
                <label className="text-sm text-gray-700 font-medium">
                  Nome completo
                </label>
                <input
                  className="border rounded-xl p-3 text-sm"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Ex: Murillo Silva"
                />
              </div>

              {/* CPF */}
              <div className="flex flex-col">
                <label className="text-sm text-gray-700 font-medium">CPF</label>
                <input
                  className="border rounded-xl p-3 text-sm"
                  value={cpf}
                  onChange={(e) => setCpf(e.target.value)}
                  onBlur={(e) => setCpf(e.target.value.replace(/\D/g, ""))}
                  placeholder="00000000000"
                  required
                  inputMode="numeric"
                  pattern="\d{11}"
                  title="Informe 11 dígitos"
                />
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
                  onBlur={(e) => setEmail(e.target.value.trim().toLowerCase())}
                  placeholder="email@exemplo.com"
                  required
                />
                <p className="text-[11px] text-gray-500 mt-1">
                  Esse email será usado no login do colaborador.
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
                <label className="text-sm text-gray-700 font-medium">CEP</label>
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
                  className="bg-black text-white rounded-xl px-4 py-3 text-sm hover:bg-gray-800"
                >
                  Buscar endereço
                </button>
              </div>
            </div>

            {/* Endereço principal */}
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
            <div className="text-red-600 text-sm font-medium">{erro}</div>
          )}
          {msgOk && (
            <div className="text-green-600 text-sm font-medium">{msgOk}</div>
          )}

          <button
            type="submit"
            disabled={salvando}
            className="w-full bg-black text-white rounded-xl px-4 py-3 text-sm font-semibold hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {salvando ? "Salvando..." : "Cadastrar colaborador"}
          </button>
        </form>
      </div>
    </main>
  );
}
