import { arrayUnion, doc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
export async function vincularAlunoAoResponsavel(uidResponsavel: string, alunoId: string) {
const ref = doc(db, 'users', uidResponsavel);
await updateDoc(ref, { alunosVinculados: arrayUnion(alunoId), updatedAt: Date.now() });
}