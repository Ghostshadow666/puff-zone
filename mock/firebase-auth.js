export const getAuth = () => { return { currentUser: { getIdToken: async () => "mock-token" } }; };
export const signInWithEmailAndPassword = async () => { return { user: { getIdTokenResult: async () => ({ claims: { admin: true } }) } }; };
export const onAuthStateChanged = (auth, cb) => { cb({ getIdTokenResult: async () => ({ claims: { admin: true } }) }); };
export const setPersistence = async () => {};
export const browserLocalPersistence = {};
export const signOut = async () => {};
