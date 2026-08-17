const fs = require('fs');
let code = fs.readFileSync('src/hooks/useCloudSync.ts', 'utf8');

code = code.replace(
  "import { collection, getDocs, writeBatch, doc } from 'firebase/firestore';",
  "import { collection, getDocs, writeBatch, doc, onSnapshot } from 'firebase/firestore';"
);

const pullFromCloudReplacement = `  const pullFromCloud = useCallback(async () => {
    if (!user) {
      setSyncStatus('Lỗi: Cần đăng nhập để đồng bộ');
      return;
    }
    setIsSyncing(true);
    setSyncStatus('Đang tải dữ liệu từ Cloud...');
    
    setTimeout(() => {
      setSyncStatus('Đang đồng bộ ngầm (real-time)...');
      setIsSyncing(false);
      setTimeout(() => setSyncStatus(null), 3000);
    }, 1000);
  }, [user]);

  // Real-time synchronization from Firestore to Dexie using onSnapshot
  useEffect(() => {
    if (!user) return;

    const setupListener = (tableName: string, dexieTable: any) => {
      const colRef = collection(firestoreDb, tableName);
      return onSnapshot(colRef, async (snapshot) => {
        const data: any[] = [];
        snapshot.forEach((doc) => {
          data.push({ ...doc.data(), id: doc.id });
        });
        
        if (data.length > 0) {
          try {
            await db.transaction('rw', dexieTable, async () => {
              await dexieTable.bulkPut(data);
            });
          } catch (err) {
            console.error(\`Error syncing \${tableName} to Dexie:\`, err);
          }
        }
      }, (error) => {
         console.error(\`Error listening to \${tableName}:\`, error);
      });
    };

    const unsubClasses = setupListener('classes', db.classes);
    const unsubStudents = setupListener('students', db.students);
    const unsubClassStudents = setupListener('class_students', db.class_students);
    const unsubSessions = setupListener('sessions', db.sessions);
    const unsubStudentSessions = setupListener('student_sessions', db.student_sessions);
    const unsubWarnings = setupListener('warnings', db.warnings);
    const unsubKnowledgeTags = setupListener('knowledge_tags', db.knowledge_tags);

    return () => {
      unsubClasses();
      unsubStudents();
      unsubClassStudents();
      unsubSessions();
      unsubStudentSessions();
      unsubWarnings();
      unsubKnowledgeTags();
    };
  }, [user]);`;

// Regex to replace pullFromCloud and the first useEffect
code = code.replace(/const pullFromCloud = useCallback\([\s\S]*?}, \[user, pullFromCloud\]\);/m, pullFromCloudReplacement);

fs.writeFileSync('src/hooks/useCloudSync.ts', code);
