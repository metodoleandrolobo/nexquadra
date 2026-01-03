//src/app/admin/novo-responsavel/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { db } from "../../../lib/firebase";
import { addDoc, collection } from "firebase/firestore";

import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "../../../lib/firebase";

// Tipos locais
type NovoAluno = {
  nome: string;
  cpf: string;
  telefone: string;
  email: string;
  nascimento: string;

  cep: string;
  endereco: string;
  numero: string;
  complemento: string;

  observacoes: string;
  status: "ativo";
};


export default function NovoResponsavelPage() {
  const router = useRouter();

  // === MENU LATERAL (se for usar depois) ===
  const [menuOpen, setMenuOpen] = useState(false);
  function closeMenu() {
    setMenuOpen(false);
  }

  // ------------------ Responsável ------------------
  const [nomeResp, setNomeResp] = useState("");
  const [cpf, setCpf] = useState("");
  const [telefoneResp, setTelefoneResp] = useState("");
  const [emailResp, setEmailResp] = useState("");
  const [diaVencimento, setDiaVencimento] = useState<string>("");
  const [nascimentoResp, setNascimentoResp] = useState("");

  // endereço
  const [cep, setCep] = useState("");
  const [endereco, setEndereco] = useState("");
  const [numero, setNumero] = useState("");
  const [complemento, setComplemento] = useState("");

  // ------------------ Alunos ------------------
  const [alunos, setAlunos] = useState<NovoAluno[]>([
    {
      nome: "",
      cpf: "",
      telefone: "",
      email: "",
      nascimento: "",

      cep: "",
      endereco: "",
      numero: "",
      complemento: "",

      observacoes: "",
      status: "ativo",
    },
  ]);

  // feedback
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [msgOk, setMsgOk] = useState("");

  // ------------------ Buscar CEP ------------------
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
  
  async function buscarEnderecoAlunoPorCep(index: number) {
  setErro("");

  const cepLimpo = alunos[index].cep.replace(/\D/g, "");
  if (cepLimpo.length !== 8) {
    setErro("CEP do aluno inválido. Use o formato 00000-000.");
    return;
  }

  try {
    const res = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`);
    const data = await res.json();

    if (data.erro) {
      setErro("CEP do aluno não encontrado.");
      return;
    }

    const enderecoMontado = `${data.logradouro || ""}, ${data.bairro || ""}, ${
      data.localidade || ""
    } - ${data.uf || ""}`.trim();

    setAlunos((prev) =>
      prev.map((a, i) =>
        i === index
          ? {
              ...a,
              endereco: enderecoMontado,
            }
          : a
      )
    );
  } catch (e) {
    console.error(e);
    setErro("Não foi possível buscar o CEP do aluno agora.");
  }
}

  // ------------------ Adicionar / Remover aluno ------------------
  function adicionarAluno() {
    setAlunos((prev) => [
      ...prev,
      {
        nome: "",
        cpf: "",
        telefone: "",
        email: "",
        nascimento: "",

        cep: "",
        endereco: "",
        numero: "",
        complemento: "",

        observacoes: "",
        status: "ativo",
      },
    ]);
  }

  function removerAluno(index: number) {
    setAlunos((prev) => prev.filter((_, i) => i !== index));
  }

  // ------------------ Salvar família (Cadastro NOVO) ------------------
async function salvarCadastro(e: React.FormEvent) {
  e.preventDefault();
  setErro("");
  setMsgOk("");

  if (!nomeResp.trim()) return setErro("Informe o nome do responsável.");
  if (!cpf.trim()) return setErro("Informe o CPF do responsável.");
  if (!emailResp.trim()) return setErro("Informe o email do responsável.");

  const alunosValidos = alunos.filter((a) => a.nome.trim() !== "");
  if (alunosValidos.length === 0) {
    return setErro("Cadastre pelo menos 1 aluno com nome preenchido.");
  }

  const temAtivo = alunosValidos.some((a) => a.status === "ativo");
  if (!temAtivo) return setErro("Pelo menos um aluno deve estar ATIVO.");

  if (!diaVencimento) {
  return setErro("Selecione o dia de vencimento da mensalidade.");
  }

  try {
    setSalvando(true);

    const payload = {
      nome: nomeResp.trim(),
      cpf, // normalizado na API
      email: emailResp.trim().toLowerCase(),
      telefone: telefoneResp,
      endereco,
      numero,
      complemento,
      diaVencimento: Number(diaVencimento),
      nascimento: nascimentoResp || "",
    };

    // 🔹 1) Cria responsável + user no Auth via API (Admin SDK)
    const resp = await fetch("/api/admin/responsaveis/novo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    // Trata erro HTTP sem quebrar JSON
    if (!resp.ok) {
      let msg = "Erro ao salvar cadastro.";
      try {
        const dataErr = await resp.json();
        if (dataErr?.error) msg = dataErr.error;
      } catch {
        /* resposta não era JSON */
      }
      throw new Error(msg);
    }

    const data = await resp.json(); // { ok, responsavelId, authUid }
    const responsavelId = data?.responsavelId as string | undefined;

    // --------------------------------------------------
    // 🔹 2) CRIAR ALUNOS VINCULADOS
    // --------------------------------------------------
    if (responsavelId) {
      for (const a of alunosValidos) {
        await addDoc(collection(db, "alunos"), {
          ...a,
          responsavelId,
          criadoEm: new Date(),
          atualizadoEm: new Date(),
        });
      }
    }

    // --------------------------------------------------
    // 🔹 3) Enviar email para DEFINIR SENHA
    // --------------------------------------------------
    try {
      await sendPasswordResetEmail(auth, payload.email);
    } catch (err: any) {
      console.error("Erro ao enviar email de definição de senha:", err);
      setErro(
        "Responsável criado, mas não foi possível enviar o email de definição de senha. O responsável pode usar 'Esqueci minha senha' na tela de login."
      );
    }

    setMsgOk(
      "Família cadastrada com sucesso! Enviamos um email para o responsável definir a senha."
    );

    router.push("/painel");
  } catch (e: any) {
    console.error(e);
    setErro(e?.message || "Erro ao salvar cadastro.");
  } finally {
    setSalvando(false);
  }
}

function copiarDadosResponsavelParaAluno(index: number) {
  setAlunos((prev) =>
    prev.map((a, i) =>
      i === index
        ? {
            ...a,

            // ✅ agora copia TUDO (inclui nome)
            nome: nomeResp || a.nome,
            cpf: cpf || a.cpf,
            telefone: telefoneResp || a.telefone,
            email: emailResp || a.email,
            nascimento: nascimentoResp || a.nascimento,

            // ✅ endereço completo
            cep: cep || a.cep,
            endereco: endereco || a.endereco,
            numero: numero || a.numero,
            complemento: complemento || a.complemento,

            // status sempre ativo
            status: "ativo",
          }
        : a
    )
  );
}

function atualizarAluno(
  index: number,
  campo: keyof NovoAluno,
  valor: string
) {
  setAlunos((prev) =>
    prev.map((a, i) =>
      i === index ? { ...a, [campo]: valor } : a
    )
  );
}


  // ------------------ UI ------------------
  return (
    <main className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow p-6 space-y-8">
        {/* Cabeçalho */}
        <header className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">
              Novo responsável
            </h1>
            <p className="text-sm text-gray-600">
              Cadastre o responsável e os alunos.
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
          {/* ------------------------------------------------- */}
          {/* BLOCO: Dados do responsável                      */}
          {/* ------------------------------------------------- */}
          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-800">
              Dados do responsável
            </h2>

            <div className="grid gap-4 sm:grid-cols-2">
              {/* Nome Responsável */}
              <div className="flex flex-col">
                <label className="text-sm text-gray-700 font-medium">
                  Nome completo do responsável
                </label>
                <input
                  className="border rounded-xl p-3 text-sm"
                  value={nomeResp}
                  onChange={(e) => setNomeResp(e.target.value)}
                  placeholder="Ex: Fulano de Tal"
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
                  Telefone do responsável
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
                  onBlur={(e) =>
                    setEmailResp(e.target.value.trim().toLowerCase())
                  }
                  placeholder="email@exemplo.com"
                  required
                />
                <p className="text-[11px] text-gray-500 mt-1">
                  Esse email pode ser usado depois no login do responsável.
                </p>
              </div>
            </div>
            
            {/* Dia do vencimento */}
              <div className="grid gap-4 sm:grid-cols-2">
                {/* Data de nascimento */}
                <div className="flex flex-col">
                  <label className="text-sm text-gray-700 font-medium">
                    Data de nascimento
                  </label>
                  <input
                    type="date"
                    className="border rounded-xl p-3 text-sm"
                    value={nascimentoResp}
                    onChange={(e) => setNascimentoResp(e.target.value)}
                  />
                </div>

                {/* Dia de vencimento */}
                <div className="flex flex-col">
                  <label className="text-sm text-gray-700 font-medium">
                    Dia de vencimento da mensalidade
                  </label>
                  <select
                    className="border rounded-xl p-3 text-sm"
                    value={diaVencimento}
                    onChange={(e) => setDiaVencimento(e.target.value)}
                    required
                  >
                    <option value="">-- Selecione --</option>
                    {Array.from({ length: 28 }).map((_, i) => (
                      <option key={i + 1} value={String(i + 1)}>
                        Dia {i + 1}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-gray-500 mt-1">
                    Esse dia será usado para gerar as cobranças mensais.
                  </p>
                </div>
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

          {/* ------------------------------------------------- */}
          {/* BLOCO: Alunos vinculados                          */}
          {/* ------------------------------------------------- */}
          <section className="space-y-4">
            <div className="flex items-center justify_between">
              <h2 className="text-lg font-semibold text-gray-800">
                Alunos vinculados
              </h2>

              <button
                type="button"
                onClick={adicionarAluno}
                className="text-[11px] px-3 py-2 rounded-lg bg-black text-white hover:bg-gray-800 uppercase tracking-wide"
                >
                + Adicionar aluno
              </button>
            </div>

            {alunos.length === 0 ? (
              <p className="text-sm text-gray-500">
                Nenhum aluno adicionado ainda.
              </p>
            ) : (
              <div className="space-y-6">
                {alunos.map((aluno, index) => (
                  <div
                    key={index}
                    className="border rounded-2xl p-4 bg-gray-50 space-y-4"
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold text-gray-800">
                        Aluno {index + 1}
                      </div>

                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => copiarDadosResponsavelParaAluno(index)}
                          className="text-[10px] px-2 py-1 rounded-lg bg-blue-600 text-white hover:bg-blue-700 uppercase tracking-wide"
                        >
                          Copiar dados do responsável
                        </button>

                        <button
                          type="button"
                          onClick={() => removerAluno(index)}
                          className="text-[10px] px-2 py-1 rounded-lg bg-red-600 text-white hover:bg-red-700 uppercase tracking-wide"
                        >
                          Excluir
                        </button>
                      </div>
                    </div>
                    
                    {/* Nome / Data de nascimento */}
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="flex flex-col">
                          <label className="text-sm text-gray-700 font-medium">
                            Nome do aluno *
                          </label>
                          <input
                            className="border rounded-xl p-3 text-sm"
                            value={aluno.nome}
                            onChange={(e) => atualizarAluno(index, "nome", e.target.value)}
                            placeholder="Nome completo"
                            required
                          />
                        </div>

                        <div className="flex flex-col">
                          <label className="text-sm text-gray-700 font-medium">
                            Data de nascimento
                          </label>
                          <input
                            type="date"
                            className="border rounded-xl p-3 text-sm"
                            value={aluno.nascimento}
                            onChange={(e) => atualizarAluno(index, "nascimento", e.target.value)}
                          />
                        </div>
                      </div>


                    {/* Telefone do aluno */}
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="flex flex-col">
                        <label className="text-sm text-gray-700 font-medium">
                          CPF
                        </label>
                        <input
                          className="border rounded-xl p-3 text-sm"
                          value={aluno.cpf}
                          onChange={(e) => atualizarAluno(index, "cpf", e.target.value)}
                          placeholder="00000000000"
                        />
                      </div>

                      <div className="flex flex-col">
                        <label className="text-sm text-gray-700 font-medium">
                          Telefone
                        </label>
                        <input
                          className="border rounded-xl p-3 text-sm"
                          value={aluno.telefone}
                          onChange={(e) => atualizarAluno(index, "telefone", e.target.value)}
                          placeholder="(11) 99999-0000"
                        />
                      </div>
                    </div>

                    {/*Bloco email */}
                    <div className="flex flex-col">
                      <label className="text-sm text-gray-700 font-medium">
                        Email
                      </label>
                      <input
                        type="email"
                        className="border rounded-xl p-3 text-sm"
                        value={aluno.email}
                        onChange={(e) => atualizarAluno(index, "email", e.target.value)}
                        placeholder="email@exemplo.com"
                      />
                    </div>

                    {/* Bloco endereço */}
                    <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
                      <div className="flex flex-col">
                        <label className="text-sm text-gray-700 font-medium">CEP</label>
                        <input
                          className="border rounded-xl p-3 text-sm"
                          value={aluno.cep}
                          onChange={(e) => atualizarAluno(index, "cep", e.target.value)}
                          placeholder="00000-000"
                        />
                      </div>

                      <div className="flex flex-col">
                        <label className="text-sm text-gray-700 font-medium invisible">
                          Buscar endereço
                        </label>
                        <button
                          type="button"
                          onClick={() => buscarEnderecoAlunoPorCep(index)}
                          className="bg-black text-white rounded-xl px-4 py-3 text-sm hover:bg-gray-800"
                        >
                          Buscar endereço
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-col">
                      <label className="text-sm text-gray-700 font-medium">
                        Endereço completo
                      </label>
                      <input
                        className="border rounded-xl p-3 text-sm"
                        value={aluno.endereco}
                        onChange={(e) => atualizarAluno(index, "endereco", e.target.value)}
                      />
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <input
                        className="border rounded-xl p-3 text-sm"
                        placeholder="Número"
                        value={aluno.numero}
                        onChange={(e) => atualizarAluno(index, "numero", e.target.value)}
                      />

                      <input
                        className="border rounded-xl p-3 text-sm"
                        placeholder="Complemento"
                        value={aluno.complemento}
                        onChange={(e) => atualizarAluno(index, "complemento", e.target.value)}
                      />
                    </div>

                    {/* Observações */}
                    <div className="flex flex-col">
                      <label className="text-sm text-gray-700 font-medium">
                        Observações
                      </label>
                      <textarea
                        className="border rounded-xl p-3 text-sm"
                        rows={2}
                        value={aluno.observacoes}
                        onChange={(e) => atualizarAluno(index, "observacoes", e.target.value)}
                        placeholder="Informações importantes sobre o aluno"
                      />
                    </div>

                    {/* Status do aluno */}
                    <div className="flex flex-col">
                      <label className="text-sm text-gray-700 font-medium">
                        Status
                      </label>
                      <select
                        className="border rounded-xl p-3 text-sm"
                        value={aluno.status}
                        onChange={(e) => {
                          const novoStatus = e.target.value as
                           "ativo";
                          setAlunos((prev) =>
                            prev.map((a, i) =>
                              i === index ? { ...a, status: novoStatus } : a
                            )
                          );
                        }}
                      >
                        <option value="ativo">Ativo</option>
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* feedback */}
          {erro && (
            <div className="text-red-600 text-sm font-medium">{erro}</div>
          )}
          {msgOk && (
            <div className="text-green-600 text-sm font-medium">{msgOk}</div>
          )}

          {/* BOTÃO FINAL */}
          <button
            type="submit"
            disabled={salvando || alunos.every((a) => a.nome.trim() === "")}
            className="w-full bg-black text-white rounded-xl px-4 py-3 text-sm font-semibold hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {salvando ? "Salvando..." : "Cadastro"}
          </button>
        </form>
      </div>
    </main>
  );
}
