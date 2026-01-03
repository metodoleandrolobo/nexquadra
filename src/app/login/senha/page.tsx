// src/app/login/senha/page.tsx
"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
} from "firebase/auth";
import { auth } from "../../../lib/firebase";

// importa o service que procura o perfil pelo EMAIL
import { findPerfilByEmail } from "../../services/findPerfilByEmail";

export default function LoginSenhaPage() {
  const params = useSearchParams();

  // email recebido pela URL
  const email = (params.get("email") || "").trim().toLowerCase();

  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const router = useRouter();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setInfo("");
    setLoading(true);

    try {
      // 1) Autentica no Firebase Auth
      await signInWithEmailAndPassword(auth, email, senha);

      // 2) Busca o perfil correspondente nas coleções
      try {
        const perfil = await findPerfilByEmail(email);

        if (perfil && typeof window !== "undefined") {
          // aqui fica igual ao “fluxo antigo”
          localStorage.setItem("nexquadraPerfilTipo", perfil.tipo); // "gestor" | "responsavel" | "colaborador"
          localStorage.setItem("nexquadraPerfilId", perfil.id);
        } else {
          console.warn(
            "[NexQuadra] Login ok, mas nenhum perfil foi encontrado para o email:",
            email
          );
        }
      } catch (err) {
        console.error("[NexQuadra] Erro ao carregar perfil do usuário:", err);
      }

      // 3) Vai para o painel
      router.push("/painel");
    } catch (err: any) {
      console.error(err);
      setErro("Senha incorreta.");
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword() {
    setErro("");
    setInfo("");

    if (!email) {
      setErro("Não foi possível identificar o email para redefinir a senha.");
      return;
    }

    try {
      await sendPasswordResetEmail(auth, email);
      setInfo("Enviamos um link de redefinição de senha para o seu email.");
    } catch (err: any) {
      console.error(err);
      setErro("Não foi possível enviar o link. Tente novamente mais tarde.");
    }
  }

  if (!email) {
    router.replace("/login");
    return null;
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <form
        onSubmit={handleLogin}
        className="w-full max-w-sm bg-white shadow-xl rounded-2xl p-6 space-y-4"
      >
        <h1 className="text-2xl font-bold text-gray-800 text-center">
          NexQuadra
        </h1>

        {/* CAMPO SENHA */}
        <div className="relative">
          <input
            type={mostrarSenha ? "text" : "password"}
            placeholder="Senha"
            className="w-full border rounded-xl p-3 pr-12"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            required
          />

          <button
            type="button"
            onClick={() => setMostrarSenha(!mostrarSenha)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500"
          >
            {mostrarSenha ? "Esconder" : "Mostrar"}
          </button>
        </div>

        {erro && <p className="text-red-500 text-sm">{erro}</p>}
        {info && <p className="text-green-600 text-sm">{info}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-black text-white rounded-xl p-3 hover:bg-gray-800 disabled:opacity-60"
        >
          {loading ? "Entrando..." : "Entrar"}
        </button>

        <button
          type="button"
          onClick={handleForgotPassword}
          className="w-full text-xs text-blue-600 mt-2 underline"
        >
          Esqueceu a senha
        </button>

        <button
          type="button"
          onClick={() => router.replace("/login")}
          className="w-full text-xs text-gray-500 mt-1 underline"
        >
          Trocar CPF
        </button>
      </form>
    </main>
  );
}
