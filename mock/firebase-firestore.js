const getLocalData = (col) => JSON.parse(localStorage.getItem('mock_db_' + col) || '[]');
const saveLocalData = (col, data) => localStorage.setItem('mock_db_' + col, JSON.stringify(data));

export const getFirestore = () => "mock-db";
export const collection = (db, col) => col;
export const doc = (db, col, id) => ({ col, id });
export const getDocs = async (col) => {
  const data = getLocalData(col);
  return { docs: data.map(d => ({ id: d.id || Math.random().toString(), data: () => d })), forEach: (cb) => data.forEach(d => cb({ id: d.id, data: () => d })) };
};
export const getDoc = async (ref) => {
  const data = getLocalData(ref.col).find(d => d.id === ref.id);
  return { exists: () => !!data, data: () => data || {} };
};
export const setDoc = async (ref, data) => {
  let list = getLocalData(ref.col);
  const idx = list.findIndex(d => d.id === ref.id);
  if(idx >= 0) list[idx] = { ...list[idx], ...data };
  else list.push({ id: ref.id, ...data });
  saveLocalData(ref.col, list);
};
export const addDoc = async (col, data) => {
  let list = getLocalData(col);
  const id = 'mock_' + Date.now();
  list.push({ id, ...data });
  saveLocalData(col, list);
  return { id };
};
export const updateDoc = async (ref, data) => { await setDoc(ref, data); };
export const deleteDoc = async (ref) => {
  let list = getLocalData(ref.col);
  saveLocalData(ref.col, list.filter(d => d.id !== ref.id));
};
export const onSnapshot = (target, cb) => {
  if (typeof target === 'string') {
    getDocs(target).then(snap => cb({ docs: snap.docs, docChanges: () => [] }));
  } else {
    getDoc(target).then(snap => cb(snap));
  }
  return () => {};
};
export const query = (col) => col;
export const orderBy = () => {};
export const where = () => {};
export const limit = () => {};
export const serverTimestamp = () => Date.now();
export const writeBatch = () => ({ commit: async () => {}, update: () => {}, set: () => {}, delete: () => {} });
export const increment = (n) => n;
export const deleteField = () => null;
export const arrayUnion = (arr) => arr;
