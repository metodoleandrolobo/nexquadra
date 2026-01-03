"use client";
import { useState } from "react";
import { db } from "../../../../lib/firebase";
import { collection, getDocs, doc, setDoc, updateDoc } from "firebase/firestore";
import { normalizeCpf, normalizeEmail } from "../../../../utils/normalize";

export default function BackfillResponsaveis() {
  const [log, setLog] = useState<string[]>([]);
  const push = (l: string) => setLog(prev => [...prev, l]);

  async function run() {
    setLog([]);
    const col = collection(db, "responsaveis");
    const snap = await getDocs(col);

    for (const d of snap.docs) {
      const data = d.data() as any;
      const id = d.id;
      const cpf = normalizeCpf(String(data.cpf || ""));
      const email = normalizeEmail(String(data.email || ""));
      let changed = false;

      if (cpf && data.cpfNorm !== cpf) { await updateDoc(d.ref, { cpfNorm: cpf }); changed = true; }
      if (email && data.emailNorm !== email) { await updateDoc(d.ref, { emailNorm: email }); changed = true; }

      // cria índices únicos, sem quebrar se já houver
      if (cpf) await setDoc(doc(db, "unique_cpf", cpf), { responsavelId: id }, { merge: true });
      if (email) await setDoc(doc(db, "unique_email", email), { responsavelId: id }, { merge: true });

      push(`${id}: ok ${changed ? "(atualizado doc)" : ""}`);
    }
    push("BACKFILL FINALIZADO.");
  }

  return (
    <div className="p-6">
      <button onClick={run} className="px-4 py-2 rounded bg-black text-white">Rodar backfill</button>
      <pre className="mt-4 text-xs whitespace-pre-wrap">{log.join("\n")}</pre>
    </div>
  );
}
