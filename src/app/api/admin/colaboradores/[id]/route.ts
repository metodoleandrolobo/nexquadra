//src/app/api/admin/colaboradores/[id]/route.ts

import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "../../../../../lib/firebaseAdmin";

// em Next 16, params é uma Promise 👇
type RouteParams = {
  params: Promise<{ id: string }>;
};

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: "ID do colaborador não informado." },
        { status: 400 }
      );
    }

    const profRef = adminDb.collection("professores").doc(id);
    const snap = await profRef.get();

    if (!snap.exists) {
      return NextResponse.json(
        { error: "Colaborador não encontrado." },
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

    const authUid: string | undefined = data.authUid;

    const uniqueCpfRef =
      cpfNorm && cpfNorm.length > 0
        ? adminDb.collection("unique_cpf").doc(cpfNorm)
        : null;

    const uniqueEmailGlobalRef =
      emailNorm && emailNorm.length > 0
        ? adminDb.collection("unique_email_global").doc(emailNorm)
        : null;

    // 1) Deleta Firestore em transação
    await adminDb.runTransaction(async (tx) => {
      const currentSnap = await tx.get(profRef);
      if (!currentSnap.exists) return;

      tx.delete(profRef);

      if (uniqueCpfRef) {
        tx.delete(uniqueCpfRef);
      }
      if (uniqueEmailGlobalRef) {
        tx.delete(uniqueEmailGlobalRef);
      }
    });

    // 2) Remove do Authentication (sem derrubar a rota se der erro)
    try {
      if (authUid) {
        await adminAuth.deleteUser(authUid);
      } else if (emailNorm) {
        const user = await adminAuth.getUserByEmail(emailNorm);
        await adminAuth.deleteUser(user.uid);
      }
    } catch (err: any) {
      if (err?.code === "auth/user-not-found") {
        console.log(
          "[DELETE colaborador] Usuário Auth não encontrado para:",
          authUid || emailNorm
        );
      } else {
        console.error(
          "[DELETE colaborador] Erro ao remover usuário do Auth:",
          err
        );
        // não relança → não quebra o fluxo
      }
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err: any) {
    console.error("Erro em DELETE /api/admin/colaboradores/[id]:", err);
    return NextResponse.json(
      {
        error:
          err?.message ||
          "Erro interno ao excluir colaborador (Firestore/backend).",
      },
      { status: 500 }
    );
  }
}