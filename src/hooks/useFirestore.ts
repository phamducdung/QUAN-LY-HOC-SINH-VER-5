// Firestore hook removed - App now runs in 100% Local IndexedDB mode
export const useFirestore = () => {
  return {
    classes: [],
    students: [],
    sessions: [],
    grades: [],
    warnings: [],
    loading: false,
    addClass: async () => {},
    updateClass: async () => {},
    archiveClass: async () => {},
    promoteClass: async () => {},
    deleteClassWithConfirmation: async () => {},
    addStudent: async () => {},
    updateStudent: async () => {},
    deleteStudent: async () => {},
    saveSessionAndGrades: async () => {},
    seedFirestoreInitialData: async () => {},
  };
};

export default useFirestore;
