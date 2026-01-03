// src/app/api/admin/colaboradores/novo/route.ts
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
      funcao = "",
      cep = "",
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
        { error: "CPF do colaborador inválido." },
        { status: 400 }
      );
    }

    if (!emailNorm) {
      return NextResponse.json(
        { error: "Email do colaborador inválido." },
        { status: 400 }
      );
    }

    // 🔹 Coleção de colaboradores/professores
    const colProf = adminDb.collection("professores");

    // 🔹 Índices únicos
    const uniqueCpfRef = adminDb.collection("unique_cpf").doc(cpfNorm);
    const uniqueEmailRef = adminDb
      .collection("unique_email_global")
      .doc(emailNorm);

    // 🔹 Pré-checagem de duplicidade (coleção professores)
    {
      // email duplicado
      const dupByEmail = await colProf
        .where("emailNorm", "==", emailNorm)
        .limit(1)
        .get();

      if (!dupByEmail.empty) {
        return NextResponse.json(
          { error: "Já existe um colaborador com este email." },
          { status: 400 }
        );
      }

      // CPF duplicado
      const dupByCpf = await colProf
        .where("cpfNorm", "==", cpfNorm)
        .limit(1)
        .get();

      if (!dupByCpf.empty) {
        return NextResponse.json(
          { error: "Já existe um colaborador com este CPF." },
          { status: 400 }
        );
      }
    }

    // 🔹 Deriva o role interno a partir da função informada
   // 🔹 Garante que funcao é um dos três valores esperados
const funcaoRaw = String(funcao || "").trim().toLowerCase();

const allowedFuncoes = ["coordenador", "professores", "secretaria"] as const;

type FuncaoPermitida = (typeof allowedFuncoes)[number];

const roleInterno: FuncaoPermitida = allowedFuncoes.includes(
  funcaoRaw as FuncaoPermitida
)
  ? (funcaoRaw as FuncaoPermitida)
  : "professores";

    // 🔹 Transação forte com índices únicos de CPF + email
    let professorId = "";

    await adminDb.runTransaction(async (tx) => {
      // verifica índices únicos
      const cpfDoc = await tx.get(uniqueCpfRef);
      if (cpfDoc.exists) {
        throw new Error("Já existe um cadastro com este CPF.");
      }

      const emailDoc = await tx.get(uniqueEmailRef);
      if (emailDoc.exists) {
        throw new Error("Já existe um cadastro com este email.");
      }

      const newProfRef = colProf.doc(); // id automático
      professorId = newProfRef.id;

      const agora = new Date();

      // cria o colaborador/professor
      tx.set(newProfRef, {
        nome: String(nome).trim(),
        cpf: cpfNorm,
        cpfNorm,
        email: emailNorm,
        emailNorm,
        telefone,
        funcao: funcao || "Professor", // rótulo exibido na UI
        cep,
        endereco,
        numero,
        complemento,

        // 🔹 campos importantes pro NexQuadra:
        role: roleInterno, // "professores" | "secretaria" | "coordenador"
        ativo: true,

        criadoEm: agora,
        atualizadoEm: agora,
        authUid: "", // vamos preencher depois
      });

      // reserva índices únicos
      tx.set(uniqueCpfRef, {
        professorId,
        tipoPerfil: "professor",
      });

      tx.set(uniqueEmailRef, {
        professorId,
        tipoPerfil: "professor",
      });
    });

    // 🔹 Cria o usuário no Authentication (Admin SDK)
    const userRecord = await adminAuth.createUser({
      email: emailNorm,
      displayName: String(nome).trim(),
      disabled: false,
    });

    // salva authUid dentro do professor
    await adminDb.collection("professores").doc(professorId).update({
      authUid: userRecord.uid,
    });

    return NextResponse.json(
      {
        ok: true,
        professorId,
        authUid: userRecord.uid,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("Erro na rota /api/admin/colaboradores/novo:", err);

    const msg = String(err?.message || "");

    if (
      msg.includes("Já existe um colaborador com este email.") ||
      msg.includes("Já existe um colaborador com este CPF.") ||
      msg.includes("Já existe um cadastro com este email.") ||
      msg.includes("Já existe um cadastro com este CPF.")
    ) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    if (msg.includes("auth/email-already-exists")) {
      return NextResponse.json(
        {
          error:
            "Já existe um usuário de autenticação com este email. Verifique se o colaborador já foi cadastrado.",
        },
        { status: 400 }
      );
    }

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

    return NextResponse.json(
      { error: "Erro interno ao salvar o colaborador." },
      { status: 500 }
    );
  }
}
