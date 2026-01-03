'use client';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { auth, db } from './firebase';
import { doc, getDoc } from 'firebase/firestore';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { UserDoc, Role } from '../app/admin/types';


interface Session {
firebaseUser: FirebaseUser | null;
userDoc: UserDoc | null;
loading: boolean;
}


const AuthCtx = createContext<Session>({ firebaseUser: null, userDoc: null, loading: true });


export function AuthProvider({ children }: { children: React.ReactNode }) {
const [state, setState] = useState<Session>({ firebaseUser: null, userDoc: null, loading: true });


useEffect(() => {
const unsub = onAuthStateChanged(auth, async (fbUser) => {
if (!fbUser) {
setState({ firebaseUser: null, userDoc: null, loading: false });
return;
}
const ref = doc(db, 'users', fbUser.uid);
const snap = await getDoc(ref);
const userDoc = snap.exists() ? ({ id: snap.id, ...snap.data() } as UserDoc) : null;
setState({ firebaseUser: fbUser, userDoc, loading: false });
});
return () => unsub();
}, []);


return <AuthCtx.Provider value={state}>{children}</AuthCtx.Provider>;
}


export function useSession() {
return useContext(AuthCtx);
}


export function useRole(): Role | null {
const { userDoc } = useSession();
return userDoc?.role ?? null;
}


export function useIs(role: Role): boolean {
const r = useRole();
return r === role;
}