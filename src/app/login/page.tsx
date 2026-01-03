// src/app/login/page.tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { collection, getDocs, query, where, limit } from "firebase/firestore";
import { db } from "../../lib/firebase";

type PerfilOrigem = "gestor" | "responsavel" | "colaborador";
type ColecaoOrigem = "users" | "responsaveis" | "professores";

type UsuarioEncontrado = {
  email: string;
  cpf: string;
  perfil: PerfilOrigem;
  colecao: ColecaoOrigem;
};

function normalizarCPF(cpf: string): string {
  return cpf.replace(/\D/g, "");
}

// Procura o CPF nas 3 coleções
async function buscarUsuarioPorCPF(
  cpfDigitado: string
): Promise<UsuarioEncontrado | null> {
  const cpf = normalizarCPF(cpfDigitado);

  if (!cpf || cpf.length < 11) {
    return null;
  }

  const colecoes: Array<{ nome: ColecaoOrigem; perfil: PerfilOrigem }> = [
    { nome: "users", responsavel: "gestor" } as any, // se quiser, arruma depois
    { nome: "responsaveis", perfil: "responsavel" },
    { nome: "professores", perfil: "colaborador" },
  ];

  for (const item of colecoes) {
    const ref = collection(db, item.nome);
    const q = query(ref, where("cpf", "==", cpf), limit(1));
    const snap = await getDocs(q);

    if (!snap.empty) {
      const doc = snap.docs[0];
      const data = doc.data() as any;
      if (data?.email) {
        return {
          email: String(data.email).toLowerCase().trim(),
          cpf,
          perfil: item.perfil,
          colecao: item.nome,
        };
      }
    }
  }

  return null;
}

export default function LoginCPFPage() {
  const [cpf, setCpf] = useState("");
  const [erro, setErro] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro("");

    const cpfTrim = cpf.trim();
    if (!cpfTrim) {
      setErro("Digite o CPF.");
      return;
    }

    setLoading(true);

    try {
      const usuario = await buscarUsuarioPorCPF(cpfTrim);

      if (!usuario) {
        setErro(
          "CPF não cadastrado. Peça ao gestor para criar seu acesso."
        );
        return;
      }

      // Se achou, aproveita o fluxo /login/senha?email=...
      router.push(`/login/senha?email=${encodeURIComponent(usuario.email)}`);
    } catch (err) {
      console.error(err);
      setErro("Ocorreu um erro ao verificar o CPF. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm bg-white shadow-xl rounded-2xl p-6 space-y-4"
      >
        <h1 className="text-2xl font-bold text-gray-800 text-center">
          NexQuadra
        </h1>

        <p className="text-sm text-gray-500 text-center">
          Digite seu CPF para continuar.
        </p>

        <input
          type="text"
          placeholder="CPF (apenas números)"
          className="w-full border rounded-xl p-3 text-sm"
          value={cpf}
          onChange={(e) => setCpf(e.target.value)}
        />

        {erro && <p className="text-red-500 text-sm">{erro}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-black text-white rounded-xl p-3 hover:bg-gray-800 text-sm font-semibold disabled:opacity-60"
        >
          {loading ? "Verificando..." : "Continuar"}
        </button>
      </form>
    </main>
  );
}
