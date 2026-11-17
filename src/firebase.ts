import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  getFirestore,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import type { ProjectDocument } from './types/circuit';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

if (typeof window !== 'undefined') {
  void testConnection();
}

export async function signInWithGoogle(): Promise<User> {
  const provider = new GoogleAuthProvider();
  const result = await signInWithPopup(auth, provider);
  return result.user;
}

export async function signOutUser(): Promise<void> {
  await signOut(auth);
}

export { onAuthStateChanged, type User };

// Strict payload sanitization matching firebase-blueprint.json & firestore.rules
function sanitizeId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
  return cleaned.length > 0 ? cleaned : `proj_${Date.now()}`;
}

export async function saveProjectToFirestore(project: ProjectDocument): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser) return;

  const safeProjectId = sanitizeId(project.id);
  const docPath = `users/${currentUser.uid}/projects/${safeProjectId}`;
  const docRef = doc(db, 'users', currentUser.uid, 'projects', safeProjectId);

  const sanitizedCircuit = {
    powerOn: Boolean(project.circuit.powerOn),
    switches: project.circuit.switches.slice(0, 16).map((s) => (s === 1 ? 1 : 0)),
    clock: {
      mode: project.circuit.clock.mode,
      autoRunning: Boolean(project.circuit.clock.autoRunning),
      frequencyHz: Number(project.circuit.clock.frequencyHz) || 1,
      dutyCyclePercent: Number(project.circuit.clock.dutyCyclePercent) || 50,
      level: project.circuit.clock.level === 1 ? 1 : 0,
    },
    pulse: {
      running: Boolean(project.circuit.pulse.running),
      frequencyHz: Number(project.circuit.pulse.frequencyHz) || 2,
      dutyCyclePercent: Number(project.circuit.pulse.dutyCyclePercent) || 50,
      level: project.circuit.pulse.level === 1 ? 1 : 0,
    },
    placedICs: project.circuit.placedICs.slice(0, 5).map((ic) => ({
      instanceId: String(ic.instanceId).slice(0, 64),
      partNumber: String(ic.partNumber).slice(0, 32),
      placement: ic.placement,
    })),
    wires: project.circuit.wires.slice(0, 200).map((w) => ({
      id: String(w.id).slice(0, 64),
      from: String(w.from).slice(0, 64),
      to: String(w.to).slice(0, 64),
      color: w.color,
      kind: w.kind,
      ...(w.controlOffset
        ? {
            controlOffset: {
              dx: Number(w.controlOffset.dx) || 0,
              dy: Number(w.controlOffset.dy) || 0,
            },
          }
        : {}),
    })),
  };

  try {
    const existingSnap = await getDoc(docRef);
    if (existingSnap.exists()) {
      const existingData = existingSnap.data();
      await setDoc(docRef, {
        id: safeProjectId,
        ownerId: currentUser.uid,
        schema: 'logicbench-project/v1',
        name: (project.name || 'Untitled Circuit').trim().slice(0, 120) || 'Untitled Circuit',
        description: (project.description || '').slice(0, 500),
        circuit: sanitizedCircuit,
        experimentNotes: project.experimentNotes ?? {},
        createdAt: existingData.createdAt ?? serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(docRef, {
        id: safeProjectId,
        ownerId: currentUser.uid,
        schema: 'logicbench-project/v1',
        name: (project.name || 'Untitled Circuit').trim().slice(0, 120) || 'Untitled Circuit',
        description: (project.description || '').slice(0, 500),
        circuit: sanitizedCircuit,
        experimentNotes: project.experimentNotes ?? {},
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, docPath);
  }
}

export async function listProjectsFromFirestore(): Promise<ProjectDocument[]> {
  const currentUser = auth.currentUser;
  if (!currentUser) return [];

  const colPath = `users/${currentUser.uid}/projects`;
  try {
    const q = query(
      collection(db, 'users', currentUser.uid, 'projects'),
      where('ownerId', '==', currentUser.uid)
    );
    const snap = await getDocs(q);
    const docs: ProjectDocument[] = [];
    snap.forEach((docSnap) => {
      const d = docSnap.data();
      const createdIso =
        d.createdAt instanceof Timestamp
          ? d.createdAt.toDate().toISOString()
          : typeof d.createdAt === 'string'
          ? d.createdAt
          : new Date().toISOString();
      const updatedIso =
        d.updatedAt instanceof Timestamp
          ? d.updatedAt.toDate().toISOString()
          : typeof d.updatedAt === 'string'
          ? d.updatedAt
          : new Date().toISOString();

      docs.push({
        schema: 'logicbench-project/v1',
        id: d.id,
        name: d.name,
        description: d.description ?? '',
        createdAt: createdIso,
        updatedAt: updatedIso,
        circuit: d.circuit,
        experimentNotes: d.experimentNotes ?? {},
      });
    });
    return docs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, colPath);
  }
}

export async function deleteProjectFromFirestore(projectId: string): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser) return;

  const safeProjectId = sanitizeId(projectId);
  const docPath = `users/${currentUser.uid}/projects/${safeProjectId}`;
  try {
    await deleteDoc(doc(db, 'users', currentUser.uid, 'projects', safeProjectId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, docPath);
  }
}
