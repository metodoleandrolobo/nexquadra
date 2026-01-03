// src/app/api/admin/responsaveis/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "../../../../../lib/firebaseAdmin";

// 👇 note que params agora é uma Promise
type RouteParams = {
  params: Promise<{ id: string }>;
};

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    // 👇 PRECISA "desembrulhar" o params
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: "ID do responsável não informado." },
        { status: 400 }
      );
    }

    const respRef = adminDb.collection("responsaveis").doc(id);
    const snap = await respRef.get();

    if (!snap.exists) {
      return NextResponse.json(
        { error: "Responsável não encontrado." },
        { status: 404 }
      );
    }

    const data = snap.data() as any;

    const cpfNorm: string = (data.cpfNorm || data.cpf || "")
      .toString()
      .replace(/\D/g, "");

    const emailNorm: string = (data.emailNorm || data.email || "")
      .toString()
      .trim()
      .toLowerCase();

    const uniqueCpfRef =
      cpfNorm && cpfNorm.length > 0
        ? adminDb.collection("unique_cpf").doc(cpfNorm)
        : null;

    const uniqueEmailRef =
      emailNorm && emailNorm.length > 0
        ? adminDb.collection("unique_email").doc(emailNorm)
        : null;

    // 1) Deleta docs no Firestore em transação
    await adminDb.runTransaction(async (tx) => {
      const currentSnap = await tx.get(respRef);
      if (!currentSnap.exists) return;

      tx.delete(respRef);

      if (uniqueCpfRef) {
        tx.delete(uniqueCpfRef);
      }
      if (uniqueEmailRef) {
        tx.delete(uniqueEmailRef);
      }
    });

    // 2) Tenta remover usuário do Authentication (sem derrubar a rota se der erro)
    if (emailNorm) {
      try {
        const user = await adminAuth.getUserByEmail(emailNorm);
        await adminAuth.deleteUser(user.uid);
      } catch (err: any) {
        if (err?.code === "auth/user-not-found") {
          console.log(
            "[DELETE responsavel] Usuário Auth não encontrado para:",
            emailNorm
          );
        } else {
          console.error(
            "[DELETE responsavel] Erro ao remover usuário do Auth:",
            err
          );
          // não relança o erro (não quebra o fluxo da exclusão)
        }
      }
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err: any) {
    console.error("Erro em DELETE /api/admin/responsaveis/[id]:", err);
    return NextResponse.json(
      {
        error:
          err?.message ||
          "Erro interno ao excluir responsável (Firestore/backend).",
      },
      { status: 500 }
    );
  }
}
