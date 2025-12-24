import React, { useState, useEffect } from 'react';
import { Login } from './components/Login';
import { TeacherPortal } from './components/TeacherPortal';
import { StudentPortal } from './components/StudentPortal';
import { User, UserRole, Assignment, Submission, ClassGroup, Session, Material, CalendarEvent, AssignmentGroup } from './types';
import { db, auth } from './firebase';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  doc, 
  query, 
  where, 
  getDocs, 
  setDoc,
  deleteDoc,
  Timestamp,
  writeBatch
} from 'firebase/firestore';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  signInAnonymously 
} from 'firebase/auth';
import { Loader2 } from 'lucide-react';

// Define locally to match TeacherPortal's structure
interface ScheduleSlot {
  day: string;
  startTime: string;
  endTime: string;
}

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  // App State - now synced with Firebase
  const [classes, setClasses] = useState<ClassGroup[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [assignmentGroups, setAssignmentGroups] = useState<AssignmentGroup[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [students, setStudents] = useState<User[]>([]);

  // 1. Auth Listener for Teacher (Firebase Auth)
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      // Ignore anonymous users (Students) in this listener. 
      // Their state is handled manually in handleLogin.
      if (firebaseUser && !firebaseUser.isAnonymous) {
        // Logged in as Teacher via Email/Auth
        setCurrentUser({
          id: firebaseUser.uid,
          role: UserRole.TEACHER,
          name: firebaseUser.displayName || firebaseUser.email || 'Teacher'
        });
      } else if (!currentUser || currentUser.role === UserRole.TEACHER) {
        // If we were expecting a teacher but no firebase user, logout
        if (currentUser?.role === UserRole.TEACHER) {
          setCurrentUser(null);
        }
      }
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []); 

  // 2. Data Listeners (Real-time updates)
  useEffect(() => {
    // CRITICAL FIX: Only connect to Firestore if the user is logged in.
    if (!currentUser) {
      setClasses([]);
      setSessions([]);
      setMaterials([]);
      setAssignments([]);
      setAssignmentGroups([]);
      setSubmissions([]);
      setEvents([]);
      setStudents([]);
      return;
    }

    const handleError = (source: string) => (error: any) => {
      console.debug(`Firestore subscription error (${source}):`, error.message);
    };

    const unsubClasses = onSnapshot(collection(db, 'classes'), (snap) => {
      setClasses(snap.docs.map(d => ({ id: d.id, ...d.data() } as ClassGroup)));
    }, handleError('classes'));

    const unsubSessions = onSnapshot(collection(db, 'sessions'), (snap) => {
      setSessions(snap.docs.map(d => ({ id: d.id, ...d.data() } as Session)));
    }, handleError('sessions'));

    const unsubMaterials = onSnapshot(collection(db, 'materials'), (snap) => {
      setMaterials(snap.docs.map(d => ({ id: d.id, ...d.data() } as Material)));
    }, handleError('materials'));

    const unsubAssignments = onSnapshot(collection(db, 'assignments'), (snap) => {
      setAssignments(snap.docs.map(d => ({ id: d.id, ...d.data() } as Assignment)));
    }, handleError('assignments'));

    const unsubAssignmentGroups = onSnapshot(collection(db, 'assignmentGroups'), (snap) => {
      setAssignmentGroups(snap.docs.map(d => ({ id: d.id, ...d.data() } as AssignmentGroup)));
    }, handleError('assignmentGroups'));

    const unsubSubmissions = onSnapshot(collection(db, 'submissions'), (snap) => {
      setSubmissions(snap.docs.map(d => ({ id: d.id, ...d.data() } as Submission)));
    }, handleError('submissions'));

    const unsubEvents = onSnapshot(collection(db, 'events'), (snap) => {
      setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() } as CalendarEvent)));
    }, handleError('events'));

    const unsubStudents = onSnapshot(query(collection(db, 'users'), where('role', '==', 'STUDENT')), (snap) => {
      setStudents(snap.docs.map(d => ({ id: d.id, ...d.data() } as User)));
    }, handleError('students'));

    return () => {
      unsubClasses();
      unsubSessions();
      unsubMaterials();
      unsubAssignments();
      unsubAssignmentGroups();
      unsubSubmissions();
      unsubEvents();
      unsubStudents();
    };
  }, [currentUser]);

  const handleLogin = async (role: UserRole, identifier: string, codeOrPassword?: string, isRegistering?: boolean) => {
    if (role === UserRole.TEACHER) {
      if (!codeOrPassword) throw new Error("Password required");
      if (isRegistering) {
        await createUserWithEmailAndPassword(auth, identifier, codeOrPassword);
      } else {
        await signInWithEmailAndPassword(auth, identifier, codeOrPassword);
      }
    } else {
      // FOR STUDENTS: Sign in anonymously first to pass Security Rules
      await signInAnonymously(auth);

      const q = query(
        collection(db, 'users'), 
        where('role', '==', 'STUDENT'),
        where('accessCode', '==', codeOrPassword)
      );

      if (identifier === 'Trung' && codeOrPassword === '1234') {
        const testCheckSnapshot = await getDocs(q);
        if (testCheckSnapshot.empty) {
           const newTestStudent = {
             role: UserRole.STUDENT,
             name: 'Trung',
             accessCode: '1234',
             enrolledClassIds: [],
             createdAt: Timestamp.now()
           };
           const ref = await addDoc(collection(db, 'users'), newTestStudent);
           setCurrentUser({ id: ref.id, ...newTestStudent } as User);
           return;
        }
      }

      const querySnapshot = await getDocs(q);
      let foundStudent: User | null = null;
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        if (data.name.toLowerCase() === identifier.toLowerCase()) {
          foundStudent = { id: doc.id, ...data } as User;
        }
      });

      if (foundStudent) {
        setCurrentUser(foundStudent);
      } else {
        if (isRegistering) {
           const newStudent = {
             role: UserRole.STUDENT,
             name: identifier,
             accessCode: codeOrPassword,
             enrolledClassIds: []
           };
           const ref = await addDoc(collection(db, 'users'), newStudent);
           setCurrentUser({ id: ref.id, ...newStudent } as User);
        } else {
           // If login failed, sign out the anonymous user immediately
           await signOut(auth);
           throw new Error("Student not found or incorrect access code.");
        }
      }
    }
  };

  const handleLogout = async () => {
    // Always sign out from Firebase to clear Teacher OR Anonymous Student sessions
    await signOut(auth);
    setCurrentUser(null);
  };

  const getNextDayOfWeek = (date: Date, dayName: string) => {
    const resultDate = new Date(date.getTime());
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const targetDayIndex = days.indexOf(dayName);
    let diff = targetDayIndex - resultDate.getDay();
    if (diff <= 0) {
      diff += 7; 
    }
    resultDate.setDate(resultDate.getDate() + diff);
    return resultDate;
  };

  // Helper to remove undefined values and handle circular refs using WeakSet
  const sanitizeForFirestore = (obj: any) => {
    const seen = new WeakSet();
    const sanitize = (value: any): any => {
      if (typeof value === 'object' && value !== null) {
        if (value instanceof Timestamp) {
            return value;
        }
        if (seen.has(value)) {
          return undefined; 
        }
        seen.add(value);
        
        if (Array.isArray(value)) {
          return value.map(sanitize).filter(v => v !== undefined);
        }
        
        const newObj: any = {};
        for (const key in value) {
          const sanitizedVal = sanitize(value[key]);
          if (sanitizedVal !== undefined) {
            newObj[key] = sanitizedVal;
          }
        }
        return newObj;
      }
      return value;
    };
    return sanitize(obj);
  };

  const handleCreateAssignmentGroup = async (group: AssignmentGroup) => {
    const safeGroup = sanitizeForFirestore(group);
    const { id, ...data } = safeGroup;
    if (id && id.length > 15) {
        await setDoc(doc(db, 'assignmentGroups', id), data);
    } else {
        await addDoc(collection(db, 'assignmentGroups'), data);
    }
  };

  const handleUpdateAssignmentGroup = async (group: AssignmentGroup) => {
    const { id, ...data } = sanitizeForFirestore(group);
    if (!id) return;
    await updateDoc(doc(db, 'assignmentGroups', id), data);
  };

  const handleReorderAssignmentGroups = async (groups: AssignmentGroup[]) => {
      try {
        const batch = writeBatch(db);
        groups.forEach((g, index) => {
            const ref = doc(db, 'assignmentGroups', g.id);
            batch.update(ref, { order: index });
        });
        await batch.commit();
      } catch (e) {
          console.error("Error reordering groups:", e);
      }
  };

  const handleDeleteAssignmentGroup = async (id: string) => {
      try {
        await deleteDoc(doc(db, 'assignmentGroups', id));
      } catch (e: any) {
        alert("Error deleting folder: " + e.message);
      }
  };

  const handleCreateAssignment = async (assignment: Assignment) => {
    const safeAssignment = sanitizeForFirestore(assignment);
    const { id, ...data } = safeAssignment;
    
    if (id && id.length > 10) {
        await setDoc(doc(db, 'assignments', id), data);
    } else {
        await addDoc(collection(db, 'assignments'), data);
    }
  };

  const handleUpdateAssignment = async (assignment: Assignment) => {
    const safeAssignment = sanitizeForFirestore(assignment);
    const { id, ...data } = safeAssignment;
    if (!id) return;
    await setDoc(doc(db, 'assignments', id), data);
  };

  const handleDeleteAssignment = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'assignments', id));
    } catch (e: any) {
      console.error("Error deleting assignment:", e);
      alert("Error deleting assignment: " + e.message);
    }
  };

  const handleAddClass = async (classGroup: ClassGroup) => {
    const safeClass = sanitizeForFirestore(classGroup);
    const { id, ...data } = safeClass;
    await addDoc(collection(db, 'classes'), data);
  };

  const handleUpdateClassSchedule = async (classId: string, newName: string, newScheduleString: string, scheduleItems: ScheduleSlot[], description?: string) => {
    try {
      const batch = writeBatch(db);
      const classRef = doc(db, 'classes', classId);
      batch.update(classRef, {
        name: newName,
        schedule: newScheduleString,
        description: description || ""
      });

      const today = new Date().toISOString().split('T')[0];
      const futureEvents = events.filter(e => e.classId === classId && e.date >= today && e.type === 'CLASS');
      
      futureEvents.forEach(e => {
        const eventRef = doc(db, 'events', e.id);
        batch.delete(eventRef);
      });

      scheduleItems.forEach(slot => {
        let nextDate = getNextDayOfWeek(new Date(), slot.day);
        
        for (let i = 0; i < 12; i++) {
          const dateString = nextDate.toISOString().split('T')[0];
          const newEventRef = doc(collection(db, 'events')); 
          const eventData = sanitizeForFirestore({
            classId: classId,
            title: `${newName} (Class)`,
            date: dateString,
            startTime: slot.startTime,
            endTime: slot.endTime,
            type: 'CLASS'
          });
          batch.set(newEventRef, eventData);
          nextDate.setDate(nextDate.getDate() + 7);
        }
      });

      await batch.commit();
      console.log("Class schedule updated and events regenerated.");
    } catch (error) {
      console.error("Error updating schedule:", error);
      throw error;
    }
  };

  const handleDeleteClass = async (classId: string) => {
    setIsLoading(true);
    try {
        const batch = writeBatch(db);
        
        // 1. Delete Class
        batch.delete(doc(db, 'classes', classId));

        // 2. Delete Events
        const eventsQ = query(collection(db, 'events'), where('classId', '==', classId));
        const eventsSnap = await getDocs(eventsQ);
        eventsSnap.forEach(d => batch.delete(d.ref));

        // 3. Delete Sessions
        const sessionsQ = query(collection(db, 'sessions'), where('classId', '==', classId));
        const sessionsSnap = await getDocs(sessionsQ);
        sessionsSnap.forEach(d => batch.delete(d.ref));

        // 4. Delete Materials (linked to sessions)
        const sessionIds = sessionsSnap.docs.map(d => d.id);
        // Using local state to find material IDs since 'in' query is limited
        const classMaterialIds = materials.filter(m => sessionIds.includes(m.sessionId)).map(m => m.id);
        classMaterialIds.forEach(id => batch.delete(doc(db, 'materials', id)));

        // 5. Delete Assignments
        const assignmentsQ = query(collection(db, 'assignments'), where('classId', '==', classId));
        const assignmentsSnap = await getDocs(assignmentsQ);
        assignmentsSnap.forEach(d => batch.delete(d.ref));
        const assignmentIds = assignmentsSnap.docs.map(d => d.id);

        // 6. Delete Assignment Groups
        const groupsQ = query(collection(db, 'assignmentGroups'), where('classId', '==', classId));
        const groupsSnap = await getDocs(groupsQ);
        groupsSnap.forEach(d => batch.delete(d.ref));

        // 7. Delete Submissions (linked to assignments)
        // Using local state to filter submissions
        const classSubmissionIds = submissions.filter(s => assignmentIds.includes(s.assignmentId)).map(s => s.id);
        classSubmissionIds.forEach(id => batch.delete(doc(db, 'submissions', id)));

        // 8. Update Students (remove enrollment)
        const classStudents = students.filter(s => s.enrolledClassIds?.includes(classId));
        classStudents.forEach(s => {
            const newIds = s.enrolledClassIds?.filter(id => id !== classId) || [];
            batch.update(doc(db, 'users', s.id), { enrolledClassIds: newIds });
        });

        await batch.commit();
    } catch (e: any) {
        console.error(e);
        alert("Delete failed: " + e.message);
    } finally {
        setIsLoading(false);
    }
  };

  const handleAddStudent = async (student: User) => {
    const safeStudent = sanitizeForFirestore(student);
    const { id, ...data } = safeStudent;
    await addDoc(collection(db, 'users'), data);
  };

  const handleRemoveStudentFromClass = async (studentId: string, classId: string) => {
    const student = students.find(s => s.id === studentId);
    if (!student) return;
    
    // Filter out the classId from the enrolledClassIds array
    const newEnrolledClassIds = student.enrolledClassIds?.filter(id => id !== classId) || [];
    
    const studentRef = doc(db, 'users', studentId);
    await updateDoc(studentRef, {
        enrolledClassIds: newEnrolledClassIds
    });
  };

  const handleAddSession = async (session: Session) => {
    const safeSession = sanitizeForFirestore(session);
    const { id, ...data } = safeSession;
    await addDoc(collection(db, 'sessions'), data);
  };

  const handleAddMaterial = async (material: Material) => {
    const safeMaterial = sanitizeForFirestore(material);
    const { id, ...data } = safeMaterial;
    await addDoc(collection(db, 'materials'), data);
  };

  const handleAddEvent = async (event: CalendarEvent) => {
    const safeEvent = sanitizeForFirestore(event);
    const { id, ...data } = safeEvent;
    await addDoc(collection(db, 'events'), data);
  };
  
  const handleSubmitAssignment = async (submission: Submission) => {
    const safeSubmission = sanitizeForFirestore(submission);
    const { id, ...data } = safeSubmission;
    await addDoc(collection(db, 'submissions'), data);
  };
  
  const handleGradeSubmission = async (id: string, grade: string, feedback: string) => {
    const subRef = doc(db, 'submissions', id);
    await updateDoc(subRef, {
        status: 'GRADED',
        grade,
        feedback
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
          <p className="text-slate-500 font-medium">Connecting to IELTS Master Database...</p>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return <Login onLogin={handleLogin} />;
  }

  if (currentUser.role === UserRole.TEACHER) {
    return (
      <TeacherPortal
        user={currentUser}
        assignments={assignments}
        assignmentGroups={assignmentGroups}
        submissions={submissions}
        classes={classes}
        students={students}
        sessions={sessions}
        materials={materials}
        events={events}
        onAddAssignment={handleCreateAssignment}
        onAddAssignmentGroup={handleCreateAssignmentGroup}
        onUpdateAssignmentGroup={handleUpdateAssignmentGroup}
        onReorderAssignmentGroups={handleReorderAssignmentGroups}
        onUpdateAssignment={handleUpdateAssignment}
        onDeleteAssignment={handleDeleteAssignment}
        onDeleteAssignmentGroup={handleDeleteAssignmentGroup}
        onGradeSubmission={handleGradeSubmission}
        onAddClass={handleAddClass}
        onUpdateClassSchedule={handleUpdateClassSchedule}
        onDeleteClass={handleDeleteClass}
        onAddStudent={handleAddStudent}
        onRemoveStudentFromClass={handleRemoveStudentFromClass}
        onAddSession={handleAddSession}
        onAddMaterial={handleAddMaterial}
        onAddEvent={handleAddEvent}
        onLogout={handleLogout}
      />
    );
  }

  return (
    <StudentPortal
      user={currentUser}
      classes={classes}
      sessions={sessions}
      materials={materials}
      assignments={assignments}
      assignmentGroups={assignmentGroups}
      submissions={submissions.filter(s => s.studentId === currentUser.id)}
      events={events}
      onSubmit={handleSubmitAssignment}
      onLogout={handleLogout}
    />
  );
};

export default App;