// src/app/api/admin/responsaveis/novo/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "../../../../../lib/firebaseAdmin";
import { normalizeCpf, normalizeEmail } from "../../../../../utils/normalize";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      nome,
      cpf,
      email,
      telefone = "",
      endereco = "",
      numero = "",
      complemento = "",
    } = body ?? {};

    if (!nome || !cpf || !email) {
      return NextResponse.json(
        { error: "Nome, CPF e email são obrigatórios." },
        { status: 400 }
      );
    }

    const cpfNorm = normalizeCpf(cpf);
    const emailNorm = normalizeEmail(email);

    if (!cpfNorm) {
      return NextResponse.json(
        { error: "CPF inválido." },
        { status: 400 }
      );
    }

    if (!emailNorm) {
      return NextResponse.json(
        { error: "Email inválido." },
        { status: 400 }
      );
    }

    // 🔹 Coleções no Firestore (Admin SDK)
    const colResp = adminDb.collection("responsaveis");
    const uniqueCpfRef = adminDb.collection("unique_cpf").doc(cpfNorm);
    const uniqueEmailRef = adminDb.collection("unique_email").doc(emailNorm);

    // 🔹 Pré-checagem de duplicidade (fora da transação)
    {
      const dupByEmail = await colResp
        .where("emailNorm", "==", emailNorm)
        .limit(1)
        .get();

      if (!dupByEmail.empty) {
        return NextResponse.json(
          { error: "Já existe um responsável com este email." },
          { status: 400 }
        );
      }

      const dupByCpf = await colResp
        .where("cpfNorm", "==", cpfNorm)
        .limit(1)
        .get();

      if (!dupByCpf.empty) {
        return NextResponse.json(
          { error: "Já existe um responsável com este CPF." },
          { status: 400 }
        );
      }
    }

    // 🔹 Transação forte com índices únicos
    let responsavelId: string = "";

    await adminDb.runTransaction(async (tx) => {
      // verifica índices únicos
      const cpfDoc = await tx.get(uniqueCpfRef);
      if (cpfDoc.exists) {
        throw new Error("Já existe um responsável com este CPF.");
      }

      const emailDoc = await tx.get(uniqueEmailRef);
      if (emailDoc.exists) {
        throw new Error("Já existe um responsável com este email.");
      }

      const newRespRef = colResp.doc(); // id automático
      responsavelId = newRespRef.id;

      // cria o responsável
      tx.set(newRespRef, {
        nome: String(nome).trim(),
        cpf: cpfNorm,
        cpfNorm: cpfNorm,
        email: emailNorm,
        emailNorm: emailNorm,
        telefone,
        endereco,
        numero,
        complemento,

        // 🔹 campos de controle que interessam pro NexQuadra:
        ativo: true,              // já existia na sua modelagem
        role: "responsavel",      // <<--- AQUI entramos com o papel do sistema

        criadoEm: new Date(),
        atualizadoEm: new Date(),
      });

      // reserva índices únicos
      tx.set(uniqueCpfRef, { responsavelId });
      tx.set(uniqueEmailRef, { responsavelId });
    });

    // 🔹 Cria o usuário no Authentication (Admin SDK)
    const userRecord = await adminAuth.createUser({
      email: emailNorm,
      displayName: String(nome).trim(),
      disabled: false,
    });

    return NextResponse.json(
      {
        ok: true,
        responsavelId,
        authUid: userRecord.uid,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("Erro na rota /api/admin/responsaveis/novo:", err);

    const msg = String(err?.message || "");

    // Erros "amigáveis" de unicidade
    if (
      msg.includes("Já existe um responsável com este CPF.") ||
      msg.includes("Já existe um responsável com este email.")
    ) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    // Erro de permissão / regra / credencial
    if (
      msg.includes("Missing or insufficient permissions") ||
      msg.includes("permission-denied")
    ) {
      return NextResponse.json(
        {
          error:
            "Erro de permissão ao acessar o Firestore no backend. Verifique se o Admin SDK está configurado corretamente.",
        },
        { status: 500 }
      );
    }

    // Genérico
    return NextResponse.json(
      { error: "Erro interno ao salvar o responsável." },
      { status: 500 }
    );
  }
}
