import React, { useState, useRef, useEffect } from 'react';
import { User, Assignment, Submission, AssignmentType, ClassGroup, Question, UserRole, Session, Material, CalendarEvent, AssignmentGroup, QuestionGroup } from '../types';
import { Plus, Users, CheckSquare, Sparkles, X, ChevronRight, BookOpen, Link as LinkIcon, Calendar as CalendarIcon, Trash2, Pencil, Image as ImageIcon, Layout, Loader2, Play, Folder, FolderPlus, ArrowLeft, MoreVertical, Square, BarChart3, FileText, Upload, AlertCircle, RefreshCw, ClipboardPaste, Eye, Minus, ShieldAlert, Bell, AlertTriangle, GripVertical } from 'lucide-react';
import { generateContent, analyzeImage, transcribeAudio, gradeWritingTask, extractQuizFromImage } from '../services/geminiService';
import { Calendar } from './Calendar';
import { RichTextEditor } from './RichTextEditor';
import { Gradebook } from './Gradebook';
import { AssignmentViewer } from './AssignmentViewer';

interface ScheduleSlot {
  day: string;
  startTime: string;
  endTime: string;
}

interface TeacherPortalProps {
  user: User;
  assignments: Assignment[];
  assignmentGroups: AssignmentGroup[];
  submissions: Submission[];
  classes: ClassGroup[];
  students: User[];
  sessions: Session[];
  materials: Material[];
  events: CalendarEvent[];
  onAddAssignment: (assignment: Assignment) => void;
  onAddAssignmentGroup: (group: AssignmentGroup) => void;
  onUpdateAssignmentGroup: (group: AssignmentGroup) => void;
  onReorderAssignmentGroups: (groups: AssignmentGroup[]) => void;
  onUpdateAssignment: (assignment: Assignment) => void;
  onDeleteAssignment: (assignmentId: string) => void;
  onDeleteAssignmentGroup: (groupId: string) => void;
  onGradeSubmission: (submissionId: string, grade: string, feedback: string, aiData?: any) => void;
  onAddClass: (classGroup: ClassGroup) => void;
  onUpdateClassSchedule: (classId: string, newName: string, newScheduleString: string, scheduleItems: ScheduleSlot[], description?: string) => void;
  onDeleteClass: (classId: string) => Promise<void>;
  onAddStudent: (student: User) => void;
  onRemoveStudentFromClass: (studentId: string, classId: string) => void;
  onAddSession: (session: Session) => void;
  onAddMaterial: (material: Material) => void;
  onAddEvent: (event: CalendarEvent) => void;
  onLogout: () => void;
}

const QUESTION_TYPE_INSTRUCTIONS: Record<string, string> = {
    'MCQ': 'Choose the correct letter, A, B, C or D.',
    'FILL_IN_BLANKS': 'Complete the sentences below. Write NO MORE THAN TWO WORDS for each answer.',
    'NOTES_COMPLETION': 'Complete the notes below. Write ONE WORD AND/OR A NUMBER from the passage for each answer.',
    'TRUE_FALSE_NG': 'Do the following statements agree with the information given in the Reading Passage? Write TRUE, FALSE or NOT GIVEN.',
    'YES_NO_NG': 'Do the following statements agree with the views of the writer in the Reading Passage? Write YES, NO or NOT GIVEN.',
    'MATCHING_HEADINGS': 'Choose the correct heading for each paragraph from the list of headings below.',
    'MATCHING_FEATURES': 'Look at the following items and the list of options below. Match each item with the correct option.',
    'MATCHING_INFORMATION': 'Which paragraph contains the following information? NB You may use any letter more than once.',
    'MATCHING_SENTENCE_ENDINGS': 'Complete each sentence with the correct ending, A-G, below.'
};

const toRoman = (num: number) => {
    const romans = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x", "xi", "xii", "xiii", "xiv", "xv"];
    return romans[num-1] || num.toString();
};

const toLetter = (num: number) => String.fromCharCode(65 + num);

export const TeacherPortal: React.FC<TeacherPortalProps> = ({ 
  user, assignments, assignmentGroups, submissions, classes, students, sessions, materials, events,
  onAddAssignment, onAddAssignmentGroup, onUpdateAssignmentGroup, onReorderAssignmentGroups, onUpdateAssignment, onDeleteAssignment, onDeleteAssignmentGroup, onGradeSubmission, onAddClass, onUpdateClassSchedule, onDeleteClass, onAddStudent, onRemoveStudentFromClass, onAddSession, onAddMaterial, onAddEvent, onLogout 
}) => {
  // Navigation State
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'schedule' | 'students' | 'sessions' | 'assignments' | 'grades'>('overview');
  
  // Assignment Folder Navigation
  const [viewingGroupId, setViewingGroupId] = useState<string | null>(null);

  // Creation Modals State
  const [showClassModal, setShowClassModal] = useState(false);
  const [editingClassId, setEditingClassId] = useState<string | null>(null);
  const [showStudentModal, setShowStudentModal] = useState(false);
  
  // Assignment Modals
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [showAssignmentModal, setShowAssignmentModal] = useState(false);
  const [editingAssignmentId, setEditingAssignmentId] = useState<string | null>(null);

  const [showSessionModal, setShowSessionModal] = useState(false);
  const [showMaterialModal, setShowMaterialModal] = useState<{sessionId: string} | null>(null);
  const [showEventModal, setShowEventModal] = useState<{date: string} | null>(null);
  const [deleteConfirmationId, setDeleteConfirmationId] = useState<string | null>(null);
  const [deleteFolderId, setDeleteFolderId] = useState<string | null>(null);
  const [studentToRemove, setStudentToRemove] = useState<{id: string, name: string} | null>(null);

  // Class Deletion State
  const [classToDelete, setClassToDelete] = useState<ClassGroup | null>(null);
  const [deleteStep, setDeleteStep] = useState<number>(0); // 0=closed, 1=confirm, 2=final warning

  // Grading State (Global)
  const [showGrading, setShowGrading] = useState(false);
  const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null);
  const [gradeInput, setGradeInput] = useState('');
  const [feedbackInput, setFeedbackInput] = useState('');
  const [isAiGrading, setIsAiGrading] = useState(false);
  const [transcription, setTranscription] = useState<string | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  
  // Grading - Writing Specific
  const [aiWritingFeedback, setAiWritingFeedback] = useState<any | null>(null);

  // AI Import State
  const [isImporting, setIsImporting] = useState(false);
  const aiImportInputRef = useRef<HTMLInputElement>(null);
  const [showJsonImportModal, setShowJsonImportModal] = useState(false);
  const [jsonInput, setJsonInput] = useState('');

  // Preview State
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewAnswers, setPreviewAnswers] = useState<Record<string, string>>({});


  // Forms State
  const [newClass, setNewClass] = useState<Partial<ClassGroup>>({});
  
  // Schedule State for New Class
  const [scheduleItems, setScheduleItems] = useState<ScheduleSlot[]>([]);
  const [tempDay, setTempDay] = useState('Monday');
  const [tempStart, setTempStart] = useState('09:00');
  const [tempEnd, setTempEnd] = useState('10:30');

  const [newStudent, setNewStudent] = useState<Partial<User>>({ role: UserRole.STUDENT, enrolledClassIds: [] });
  const [newSession, setNewSession] = useState<Partial<Session>>({});
  const [newMaterial, setNewMaterial] = useState<Partial<Material>>({ type: 'LINK' });
  const [newEvent, setNewEvent] = useState<Partial<CalendarEvent>>({ type: 'CLASS' });
  
  // Folder Creation State
  const [newFolderTitle, setNewFolderTitle] = useState('');

  // Assignment Creation State
  const [newAssignment, setNewAssignment] = useState<Partial<Assignment>>({
    type: AssignmentType.READING,
    questions: [], 
    questionGroups: [],
    classId: '',
    writingTaskType: 'TASK_1',
    timeLimit: undefined // Optional
  });
  const [showDatePicker, setShowDatePicker] = useState(false);
  
  // READING MODULE BUILDER STATE
  const [tempQuestionGroups, setTempQuestionGroups] = useState<QuestionGroup[]>([]);
  const [activeGroupIndex, setActiveGroupIndex] = useState<number | null>(null);
  
  // Temp State for Adding Question to a Group
  const [tempQuestionText, setTempQuestionText] = useState('');
  const [tempMcqOptions, setTempMcqOptions] = useState<string[]>([]);
  const [tempOptionInput, setTempOptionInput] = useState('');
  const [tempCorrectAnswer, setTempCorrectAnswer] = useState<string | null>(null);
  const [tempMaxSelection, setTempMaxSelection] = useState<number>(1);
  
  // Temp State for Heading/Option List
  const [tempHeadingInput, setTempHeadingInput] = useState('');
  const [tempMatchOptionInput, setTempMatchOptionInput] = useState('');
  
  // Drag and Drop State for Folders
  const [draggedGroupIndex, setDraggedGroupIndex] = useState<number | null>(null);
  const [localGroups, setLocalGroups] = useState<AssignmentGroup[]>([]);

  // Sync local groups for drag and drop when props change
  useEffect(() => {
    if (selectedClassId) {
        const groups = assignmentGroups
            .filter(g => g.classId === selectedClassId)
            .sort((a, b) => (a.order || 0) - (b.order || 0));
        setLocalGroups(groups);
    }
  }, [assignmentGroups, selectedClassId]);

  const pendingSubmissions = submissions.filter(s => s.status === 'SUBMITTED');
  const selectedClass = classes.find(c => c.id === selectedClassId);

  // --- Helpers ---
  const getNextDayOfWeek = (date: Date, dayName: string) => {
    const resultDate = new Date(date.getTime());
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const targetDayIndex = days.indexOf(dayName);
    let diff = targetDayIndex - resultDate.getDay();
    if (diff <= 0) diff += 7;
    resultDate.setDate(resultDate.getDate() + diff);
    return resultDate;
  };
  
  // Helper to count pending submissions for a specific class
  const getClassPendingCount = (classId: string) => {
      return submissions.filter(s => 
          s.status === 'SUBMITTED' && 
          assignments.find(a => a.id === s.assignmentId)?.classId === classId
      ).length;
  };

  const addScheduleSlot = () => {
    if (!tempStart || !tempEnd) return;
    setScheduleItems([...scheduleItems, { day: tempDay, startTime: tempStart, endTime: tempEnd }]);
  };

  const removeScheduleSlot = (index: number) => {
    const newItems = [...scheduleItems];
    newItems.splice(index, 1);
    setScheduleItems(newItems);
  };

  const toggleMcqCorrectAnswer = (letter: string) => {
      const current = tempCorrectAnswer ? tempCorrectAnswer.split(',') : [];
      if (current.includes(letter)) {
          const next = current.filter(l => l !== letter);
          setTempCorrectAnswer(next.length ? next.sort().join(',') : null);
      } else {
          const next = [...current, letter].sort();
          setTempCorrectAnswer(next.join(','));
      }
  };
  
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        // Clean base64 for storage if needed, but keeping full data uri is easier for simple img tags
        const base64Data = base64String.split(',')[1];
        setNewAssignment(prev => ({ ...prev, writingImage: base64Data }));
      };
      reader.readAsDataURL(file);
    }
  };
  
  const generateAccessCode = () => {
    let code = '';
    let isUnique = false;
    let attempts = 0;
    while (!isUnique && attempts < 100) {
      // Generate 6 random digits
      code = Math.floor(100000 + Math.random() * 900000).toString();
      // Check for collision
      if (!students.some(s => s.accessCode === code)) {
        isUnique = true;
      }
      attempts++;
    }
    return code;
  };

  // --- AI IMPORT HANDLER ---
  const handleAiImportClick = () => {
    aiImportInputRef.current?.click();
  };

  const handleAiImportFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setIsImporting(true);
    try {
        const reader = new FileReader();
        reader.onloadend = async () => {
            const base64String = reader.result as string;
            const base64Data = base64String.split(',')[1];
            
            try {
                // Pass mimeType to support PDF and Image
                const data = await extractQuizFromImage(base64Data, file.type);
                
                // Update State with Extracted Data
                if (data.passageContent) {
                    setNewAssignment(prev => ({ ...prev, passageContent: data.passageContent }));
                }
                
                if (data.questionGroups && Array.isArray(data.questionGroups)) {
                    // Ensure unique IDs for imported groups and questions
                    const processedGroups = data.questionGroups.map((g: any) => ({
                        ...g,
                        id: `qg_${Date.now()}_${Math.random().toString(36).substr(2,9)}`,
                        questions: g.questions.map((q: any) => ({
                            ...q,
                            id: `q_${Date.now()}_${Math.random().toString(36).substr(2,9)}`
                        }))
                    }));
                    setTempQuestionGroups(prev => [...prev, ...processedGroups]);
                }
                
                alert("Import successful! Please review the extracted data.");
            } catch (err) {
                console.error(err);
                alert("Failed to extract data from file. Please ensure it is clear.");
            } finally {
                setIsImporting(false);
                if (aiImportInputRef.current) aiImportInputRef.current.value = '';
            }
        };
        reader.readAsDataURL(file);
    } catch (e) {
        console.error(e);
        alert("Error reading file.");
        setIsImporting(false);
    }
  };

  const handleJsonImport = () => {
    if (!jsonInput.trim()) {
      alert("Please paste the JSON data into the text area.");
      return;
    }
    try {
      const data = JSON.parse(jsonInput);

      if (!data.passageContent || !Array.isArray(data.questionGroups)) {
        throw new Error("Invalid JSON structure. The JSON must contain 'passageContent' (string) and 'questionGroups' (array).");
      }
      
      // Update State with Extracted Data
      if (data.passageContent) {
          setNewAssignment(prev => ({ ...prev, passageContent: data.passageContent }));
      }
      
      if (data.questionGroups) {
          const processedGroups = data.questionGroups.map((g: any) => ({
              ...g,
              id: `qg_${Date.now()}_${Math.random().toString(36).substr(2,9)}`,
              questions: g.questions.map((q: any) => ({
                  ...q,
                  id: `q_${Date.now()}_${Math.random().toString(36).substr(2,9)}`
              }))
          }));
          setTempQuestionGroups(prev => [...prev, ...processedGroups]);
      }
      
      alert("JSON imported successfully! Please review the populated data.");
      setShowJsonImportModal(false);
      setJsonInput('');

    } catch (error: any) {
      console.error("JSON Parse Error:", error);
      alert(`Failed to import JSON: ${error.message}`);
    }
  };
  
  // Construct Preview Object
  const getPreviewAssignment = () => {
      // Logic from handleSaveAssignment to process Notes Completion Groups
      const processedQuestionGroups = tempQuestionGroups.map(group => {
        if (group.type === 'NOTES_COMPLETION' && group.content) {
            const matches = [...group.content.matchAll(/\[(.*?)\]/g)];
            const generatedQuestions: Question[] = matches.map((m, i) => ({
                id: `q_prev_${i}`,
                text: m[0],
                type: 'NOTES_COMPLETION',
                correctAnswer: m[1]
            }));
            return {
                ...group,
                questions: generatedQuestions
            };
        }
        return group;
      });

      return {
          ...newAssignment,
          id: 'preview_id',
          title: newAssignment.title || 'Untitled Assignment',
          questionGroups: processedQuestionGroups
      } as Assignment;
  };
  
  const handleOpenPreview = () => {
      setPreviewAnswers({});
      setShowPreviewModal(true);
  };


  // --- Handlers ---
  const openClassModalForEdit = () => {
    if (!selectedClass) return;
    setEditingClassId(selectedClass.id);
    setNewClass({ name: selectedClass.name, description: selectedClass.description });
    const parsedItems: ScheduleSlot[] = [];
    try {
      const parts = selectedClass.schedule.split(', ');
      parts.forEach(part => {
        const match = part.trim().match(/^([A-Za-z]+)s (\d{2}:\d{2}) - (\d{2}:\d{2})$/);
        if (match) parsedItems.push({ day: match[1], startTime: match[2], endTime: match[3] });
      });
    } catch (e) { console.log("Could not parse schedule", e); }
    setScheduleItems(parsedItems.length > 0 ? parsedItems : [{ day: 'Monday', startTime: '09:00', endTime: '10:30' }]);
    setShowClassModal(true);
  };

  const openClassModalForCreate = () => {
    setEditingClassId(null);
    setNewClass({});
    setScheduleItems([{ day: 'Monday', startTime: '09:00', endTime: '10:30' }]);
    setShowClassModal(true);
  };

  const handleSaveClass = () => {
    if (!newClass.name) return alert("Class name is required");
    if (scheduleItems.length === 0) return alert("Please add at least one schedule slot");
    const formattedSchedule = scheduleItems.map(item => `${item.day}s ${item.startTime} - ${item.endTime}`).join(', ');

    if (editingClassId) {
       onUpdateClassSchedule(editingClassId, newClass.name, formattedSchedule, scheduleItems, newClass.description);
    } else {
       const classId = `c_${Date.now()}`;
       onAddClass({ id: classId, name: newClass.name, schedule: formattedSchedule, description: newClass.description });
       scheduleItems.forEach(slot => {
         let nextDate = getNextDayOfWeek(new Date(), slot.day);
         for (let i = 0; i < 12; i++) {
           onAddEvent({
             id: `evt_auto_${classId}_${slot.day}_${i}_${Date.now()}`,
             classId: classId,
             title: `${newClass.name} (Class)`,
             date: nextDate.toISOString().split('T')[0],
             startTime: slot.startTime,
             endTime: slot.endTime,
             type: 'CLASS'
           });
           nextDate.setDate(nextDate.getDate() + 7);
         }
       });
    }
    setShowClassModal(false);
    setNewClass({});
    setScheduleItems([]);
  };
  
  const handleOpenAddStudent = () => {
      setNewStudent({ 
          role: UserRole.STUDENT, 
          enrolledClassIds: [],
          accessCode: generateAccessCode()
      });
      setShowStudentModal(true);
  };

  const handleSaveStudent = () => {
    if (!newStudent.name || !newStudent.accessCode) return alert("Required fields missing");
    const enrolledIds = selectedClassId ? [...(newStudent.enrolledClassIds || []), selectedClassId] : newStudent.enrolledClassIds || [];
    onAddStudent({ id: `s_${Date.now()}`, role: UserRole.STUDENT, name: newStudent.name!, accessCode: newStudent.accessCode!, enrolledClassIds: enrolledIds });
    setShowStudentModal(false);
    setNewStudent({ role: UserRole.STUDENT, enrolledClassIds: [] });
  };

  const handleConfirmRemoveStudent = () => {
      if (studentToRemove && selectedClassId) {
          onRemoveStudentFromClass(studentToRemove.id, selectedClassId);
          setStudentToRemove(null);
      }
  };

  const handleSaveSession = () => {
    if (!selectedClassId || !newSession.title) return;
    onAddSession({ id: `sess_${Date.now()}`, classId: selectedClassId, title: newSession.title, description: newSession.description });
    setShowSessionModal(false);
    setNewSession({});
  };

  const handleSaveMaterial = () => {
    if (!showMaterialModal?.sessionId || !newMaterial.title || !newMaterial.url) return;
    onAddMaterial({ id: `mat_${Date.now()}`, sessionId: showMaterialModal.sessionId, title: newMaterial.title!, type: newMaterial.type || 'LINK', url: newMaterial.url! });
    setShowMaterialModal(null);
    setNewMaterial({ type: 'LINK' });
  };

  const handleSaveEvent = () => {
    if (!selectedClassId || !showEventModal?.date || !newEvent.title) return;
    onAddEvent({ id: `evt_${Date.now()}`, classId: selectedClassId, date: showEventModal.date, title: newEvent.title, type: newEvent.type || 'CLASS', startTime: newEvent.startTime, endTime: newEvent.endTime });
    setShowEventModal(null);
    setNewEvent({ type: 'CLASS' });
  };

  // --- FOLDER & ASSIGNMENT LOGIC ---

  const handleSaveFolder = () => {
      if(!newFolderTitle.trim() || !selectedClassId) return;
      
      if (editingFolderId) {
          const groupToUpdate = assignmentGroups.find(g => g.id === editingFolderId);
          if (groupToUpdate) {
              onUpdateAssignmentGroup({
                  ...groupToUpdate,
                  title: newFolderTitle
              });
          }
      } else {
          onAddAssignmentGroup({
              id: `grp_${Date.now()}`,
              classId: selectedClassId,
              title: newFolderTitle,
              createdAt: new Date().toISOString(),
              order: localGroups.length // Append to end
          });
      }

      setNewFolderTitle('');
      setEditingFolderId(null);
      setShowFolderModal(false);
  };
  
  const handleOpenFolderEdit = (group: AssignmentGroup) => {
      setNewFolderTitle(group.title);
      setEditingFolderId(group.id);
      setShowFolderModal(true);
  };

  const handleDeleteFolder = () => {
      if(deleteFolderId) {
          onDeleteAssignmentGroup(deleteFolderId);
          setDeleteFolderId(null);
      }
  }

  // --- DRAG AND DROP HANDLERS FOR FOLDERS ---
  const handleDragStart = (e: React.DragEvent, index: number) => {
      setDraggedGroupIndex(index);
      e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
      e.preventDefault();
      if (draggedGroupIndex === null || draggedGroupIndex === index) return;
      
      const newGroups = [...localGroups];
      const draggedItem = newGroups[draggedGroupIndex];
      
      // Remove from old position
      newGroups.splice(draggedGroupIndex, 1);
      // Insert at new position
      newGroups.splice(index, 0, draggedItem);
      
      setLocalGroups(newGroups);
      setDraggedGroupIndex(index);
  };

  const handleDragEnd = () => {
      setDraggedGroupIndex(null);
      // Persist the new order to Firestore
      onReorderAssignmentGroups(localGroups);
  };


  const handleEditAssignment = (assignment: Assignment) => {
    setEditingAssignmentId(assignment.id);
    // Ensure writingTaskType is defaulted for legacy writing assignments
    const assignmentToEdit = { ...assignment };
    if (assignmentToEdit.type === AssignmentType.WRITING && !assignmentToEdit.writingTaskType) {
        assignmentToEdit.writingTaskType = 'TASK_1';
    }
    setNewAssignment(assignmentToEdit);
    setTempQuestionGroups(assignment.questionGroups || []);
    setShowAssignmentModal(true);
  };
  
  const handleDeleteAssignmentAction = (assignmentId: string) => {
    setDeleteConfirmationId(assignmentId);
  };

  const confirmDeleteAssignment = () => {
    if (deleteConfirmationId) {
      onDeleteAssignment(deleteConfirmationId);
      setDeleteConfirmationId(null);
    }
  };

  const confirmDeleteClass = async () => {
      if (classToDelete) {
          await onDeleteClass(classToDelete.id);
          setClassToDelete(null);
          setDeleteStep(0);
      }
  };

  const handleSaveAssignment = () => {
    const classId = selectedClassId || newAssignment.classId;
    if (!newAssignment.title || !newAssignment.dueDate || !classId) {
      alert("Please fill in Title, Due Date, and ensure Class is selected");
      return;
    }

    if (newAssignment.type === AssignmentType.WRITING && !newAssignment.writingPrompt) {
        alert("Please enter an essay prompt");
        return;
    }

    // Process Notes Completion Groups to Generate Questions automatically
    const processedQuestionGroups = tempQuestionGroups.map(group => {
        if (group.type === 'NOTES_COMPLETION' && group.content) {
            // Find all bracketed answers e.g. [answer]
            const matches = [...group.content.matchAll(/\[(.*?)\]/g)];
            const generatedQuestions: Question[] = matches.map((m, i) => ({
                id: `q_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                text: m[0], // Store the original bracket text
                type: 'NOTES_COMPLETION',
                correctAnswer: m[1] // Store the inner text as correct answer
            }));
            return {
                ...group,
                questions: generatedQuestions
            };
        }
        return group;
    });
    
    // Ensure Writing Task Type is never undefined if type is WRITING
    let finalWritingTaskType = newAssignment.writingTaskType;
    if (newAssignment.type === AssignmentType.WRITING && !finalWritingTaskType) {
        finalWritingTaskType = 'TASK_1';
    }

    const assignmentData = {
      id: editingAssignmentId || Date.now().toString(),
      classId: classId,
      groupId: viewingGroupId || undefined, // Attach to folder if inside one
      title: newAssignment.title!,
      type: newAssignment.type!,
      description: newAssignment.description || "",
      dueDate: newAssignment.dueDate!,
      timeLimit: newAssignment.timeLimit,
      
      // Reading Fields
      passageContent: newAssignment.passageContent,
      questionGroups: processedQuestionGroups,

      // Listening Fields
      videoUrl: newAssignment.videoUrl,

      // Writing Fields
      writingTaskType: finalWritingTaskType,
      writingPrompt: newAssignment.writingPrompt,
      writingImage: newAssignment.writingImage,
    };

    if (editingAssignmentId) {
        onUpdateAssignment(assignmentData);
    } else {
        onAddAssignment(assignmentData);
    }

    setShowAssignmentModal(false);
    setEditingAssignmentId(null);
    setNewAssignment({ type: AssignmentType.READING });
    setTempQuestionGroups([]);
  };

  // --- QUESTION GROUP BUILDER ---

  const handleAddQuestionGroup = () => {
      const type = 'MCQ';
      const newGroup: QuestionGroup = {
          id: `qg_${Date.now()}`,
          type: type,
          title: `Questions`,
          instruction: QUESTION_TYPE_INSTRUCTIONS[type],
          questions: [],
          headingList: [],
          matchOptions: []
      };
      setTempQuestionGroups([...tempQuestionGroups, newGroup]);
      setActiveGroupIndex(tempQuestionGroups.length); // Open new group
  };

  const handleGroupTypeChange = (index: number, newType: string) => {
    const updated = [...tempQuestionGroups];
    updated[index].type = newType as any;
    updated[index].instruction = QUESTION_TYPE_INSTRUCTIONS[newType] || '';
    if (newType === 'MATCHING_HEADINGS' && !updated[index].headingList) {
        updated[index].headingList = [];
    }
    if ((newType === 'MATCHING_FEATURES' || newType === 'MATCHING_SENTENCE_ENDINGS') && !updated[index].matchOptions) {
        updated[index].matchOptions = [];
    }
    setTempQuestionGroups(updated);
  };

  const handleAddQuestionToGroup = (groupIndex: number) => {
      if(!tempQuestionText) return alert("Question text required");
      
      const groupType = tempQuestionGroups[groupIndex].type;
      
      let finalCorrectAnswer = tempCorrectAnswer;

      // Special Logic for Sentence Completion
      if (groupType === 'FILL_IN_BLANKS') {
         // Extract answer from brackets
         const match = tempQuestionText.match(/\[(.*?)\]/);
         if (match && match[1]) {
            finalCorrectAnswer = match[1];
         } else {
            alert("Please format your sentence correctly: Wrap the answer in [brackets].\n\nExample: The sun rises in the [east].");
            return;
         }
      }

      const newQ: Question = {
          id: `q_${Date.now()}`,
          text: tempQuestionText,
          type: groupType as Question['type'], // Inherit type from group
          options: groupType === 'MCQ' ? [...tempMcqOptions] : undefined,
          correctAnswer: finalCorrectAnswer || undefined,
          maxSelection: groupType === 'MCQ' ? tempMaxSelection : undefined
      };

      const updatedGroups = [...tempQuestionGroups];
      updatedGroups[groupIndex].questions.push(newQ);
      setTempQuestionGroups(updatedGroups);

      // Reset Temp
      setTempQuestionText('');
      setTempMcqOptions([]);
      setTempOptionInput('');
      setTempCorrectAnswer(null);
      setTempMaxSelection(1);
  };

  const removeQuestionFromGroup = (groupIndex: number, qId: string) => {
    const updatedGroups = [...tempQuestionGroups];
    updatedGroups[groupIndex].questions = updatedGroups[groupIndex].questions.filter(q => q.id !== qId);
    setTempQuestionGroups(updatedGroups);
  };

  const updateQuestionAnswer = (groupIndex: number, qId: string, newAnswer: string) => {
    const updatedGroups = [...tempQuestionGroups];
    const q = updatedGroups[groupIndex].questions.find(q => q.id === qId);
    if (q) {
        q.correctAnswer = newAnswer;
        setTempQuestionGroups(updatedGroups);
    }
  };
  
  const addHeadingToGroup = (groupIndex: number) => {
      if (!tempHeadingInput.trim()) return;
      const updatedGroups = [...tempQuestionGroups];
      if (!updatedGroups[groupIndex].headingList) updatedGroups[groupIndex].headingList = [];
      updatedGroups[groupIndex].headingList!.push(tempHeadingInput);
      setTempQuestionGroups(updatedGroups);
      setTempHeadingInput('');
  };
  
  const removeHeadingFromGroup = (groupIndex: number, headingIdx: number) => {
      const updatedGroups = [...tempQuestionGroups];
      if (updatedGroups[groupIndex].headingList) {
          updatedGroups[groupIndex].headingList!.splice(headingIdx, 1);
          setTempQuestionGroups(updatedGroups);
      }
  };

  const addMatchOptionToGroup = (groupIndex: number) => {
      if (!tempMatchOptionInput.trim()) return;
      const updatedGroups = [...tempQuestionGroups];
      if (!updatedGroups[groupIndex].matchOptions) updatedGroups[groupIndex].matchOptions = [];
      updatedGroups[groupIndex].matchOptions!.push(tempMatchOptionInput);
      setTempQuestionGroups(updatedGroups);
      setTempMatchOptionInput('');
  };

  const removeMatchOptionFromGroup = (groupIndex: number, optIdx: number) => {
      const updatedGroups = [...tempQuestionGroups];
      if (updatedGroups[groupIndex].matchOptions) {
          updatedGroups[groupIndex].matchOptions!.splice(optIdx, 1);
          setTempQuestionGroups(updatedGroups);
      }
  };

  // --- AI Logic ---
  const handleAutoGrade = async () => {
    if (!selectedSubmission) return;
    setIsAiGrading(true);
    try {
      // General feedback logic (old)
      const prompt = `Grade this IELTS submission. Provide Band Score and Feedback.`;
      const response = await generateContent(prompt);
      setGradeInput("6.5"); 
      setFeedbackInput(response);
    } catch (e) { alert("AI Grading failed"); } finally { setIsAiGrading(false); }
  };
  
  const handleAiGradeWriting = async () => {
    if (!selectedSubmission) return;
    const assignment = assignments.find(a => a.id === selectedSubmission.assignmentId);
    if (!assignment || !assignment.writingTaskType || !assignment.writingPrompt) return;

    setIsAiGrading(true);
    try {
        const studentEssay = selectedSubmission.answers['essay'];
        if (!studentEssay) {
            alert("No essay found in submission");
            return;
        }

        const result = await gradeWritingTask(
            assignment.writingTaskType,
            assignment.writingPrompt,
            studentEssay,
            assignment.writingImage
        );

        setAiWritingFeedback(result);
        setGradeInput(result.overallBand.toString());
        setFeedbackInput(result.generalComment);
    } catch (e) {
        console.error(e);
        alert("AI Grading Failed. Please try again.");
    } finally {
        setIsAiGrading(false);
    }
  };

  const handleTranscribeSubmission = async (base64AudioUrl: string) => {
    setIsTranscribing(true);
    try {
       const base64 = base64AudioUrl.split(',')[1];
       const mime = base64AudioUrl.split(';')[0].split(':')[1];
       const text = await transcribeAudio(base64, mime);
       setTranscription(text);
    } catch (e) { alert("Transcription failed"); } finally { setIsTranscribing(false); }
  };

  // --- RENDERERS ---
  
  return (
    <div className="min-h-screen bg-slate-50 p-8">
       
       {/* AI IMPORT LOADING OVERLAY */}
       {isImporting && (
          <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center backdrop-blur-sm animate-in fade-in">
             <div className="bg-white p-8 rounded-2xl shadow-2xl flex flex-col items-center gap-4 border border-slate-100 max-w-sm w-full">
                <div className="relative">
                    <div className="w-16 h-16 border-4 border-indigo-100 rounded-full"></div>
                    <div className="w-16 h-16 border-4 border-indigo-600 rounded-full border-t-transparent animate-spin absolute top-0 left-0"></div>
                    <Sparkles className="w-6 h-6 text-indigo-600 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-pulse" />
                </div>
                <div className="text-center">
                    <h3 className="text-xl font-bold text-slate-900 mb-1">Analyzing Document</h3>
                    <p className="text-slate-500">Extracting questions and passage...</p>
                </div>
                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden mt-2">
                    <div className="h-full bg-indigo-600 rounded-full w-1/2 animate-[pulse_2s_infinite]"></div>
                </div>
             </div>
          </div>
       )}

       {/* Dashboard Content */}
       <div className="max-w-7xl mx-auto">
          {!showGrading && !selectedClass && (
            <>
              {/* Teacher Dashboard Header */}
              <div className="flex justify-between items-center mb-10">
                 <div>
                   <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
                     <Sparkles className="text-indigo-600" fill="currentColor" fillOpacity={0.2} /> 
                     Teacher Dashboard
                   </h1>
                   <p className="text-slate-500 mt-2">Manage your classes, students and curriculum.</p>
                 </div>
                 <div className="flex items-center gap-4">
                    <button 
                        onClick={() => setShowGrading(true)} 
                        className="flex items-center gap-2 bg-white border border-slate-200 text-slate-700 px-4 py-2.5 rounded-lg hover:bg-slate-50 font-bold shadow-sm relative transition-all active:scale-95"
                    >
                       <CheckSquare size={18} className="text-slate-500" /> 
                       Grading Queue
                       {pendingSubmissions.length > 0 && (
                           <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] font-bold w-6 h-6 flex items-center justify-center rounded-full border-2 border-white shadow-sm animate-in zoom-in">
                               {pendingSubmissions.length}
                           </span>
                       )}
                    </button>
                    <div className="h-8 w-px bg-slate-300"></div>
                    <button onClick={onLogout} className="text-sm text-slate-500 hover:text-red-600 font-medium">Logout</button>
                 </div>
              </div>

              {/* Class List */}
              <div className="mb-8">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-bold text-slate-800">Your Classes</h2>
                  <button onClick={openClassModalForCreate} className="bg-indigo-600 text-white px-5 py-2.5 rounded-lg shadow-lg shadow-indigo-200 hover:bg-indigo-700 flex items-center gap-2 font-medium">
                    <Plus size={18} /> Create New Class
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {classes.map(c => {
                      const pendingCount = getClassPendingCount(c.id);
                      return (
                        <div key={c.id} onClick={() => setSelectedClassId(c.id)} className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-xl hover:border-indigo-300 hover:-translate-y-1 transition-all cursor-pointer group overflow-hidden relative">
                          <div className="h-2 bg-gradient-to-r from-indigo-500 to-purple-500"></div>
                          
                          {/* DELETE CLASS BUTTON */}
                          <button 
                             onClick={(e) => { e.stopPropagation(); setClassToDelete(c); setDeleteStep(1); }}
                             className="absolute top-4 right-4 p-2 bg-white/80 rounded-full hover:bg-red-100 hover:text-red-600 transition-colors opacity-0 group-hover:opacity-100 z-10"
                             title="Delete Class"
                          >
                             <Trash2 size={16} />
                          </button>

                          {/* CLASS NOTIFICATION BADGE */}
                          {pendingCount > 0 && (
                              <div className="absolute top-4 left-4 bg-red-100 text-red-600 px-2 py-1 rounded-full text-[10px] font-bold border border-red-200 flex items-center gap-1.5 shadow-sm">
                                  <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse"></div>
                                  {pendingCount} Needs Grading
                              </div>
                          )}

                          <div className="p-6">
                            <h3 className="text-xl font-bold text-slate-900 mb-2 group-hover:text-indigo-600 transition-colors pr-8 truncate">{c.name}</h3>
                            <div className="flex items-center gap-2 text-slate-500 text-sm mb-4"><CalendarIcon size={16} /><span>{c.schedule}</span></div>
                            <p className="text-sm text-slate-400 line-clamp-2">{c.description || "No description."}</p>
                          </div>
                          <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-between items-center text-xs font-medium text-slate-500">
                             <span className="flex items-center gap-1"><Users size={14}/> {students.filter(s => s.enrolledClassIds?.includes(c.id)).length} Students</span>
                          </div>
                        </div>
                      );
                  })}
                </div>
              </div>
            </>
          )}

          {/* Grading View */}
          {showGrading && (
             <div className="max-w-6xl mx-auto">
                {/* ... (Existing grading view logic - unchanged) ... */}
                <button onClick={() => setShowGrading(false)} className="mb-4 text-slate-500 hover:text-slate-900 flex items-center gap-2">&larr; Back to Dashboard</button>
                <h2 className="text-2xl font-bold mb-6">Grading Queue</h2>
                {!selectedSubmission ? (
                  <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                    <table className="w-full text-left">
                      <thead className="bg-slate-50 border-b">
                        <tr><th className="px-6 py-4 text-sm font-semibold text-slate-600">Student</th><th className="px-6 py-4 text-sm font-semibold text-slate-600">Assignment</th><th className="px-6 py-4 text-sm font-semibold text-slate-600">Action</th></tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {pendingSubmissions.length === 0 && <tr><td colSpan={3} className="p-6 text-center text-slate-500">No pending submissions</td></tr>}
                        {pendingSubmissions.map(s => (
                          <tr key={s.id} className="hover:bg-slate-50">
                            <td className="px-6 py-4">{s.studentName}</td><td className="px-6 py-4">{assignments.find(a => a.id === s.assignmentId)?.title}</td>
                            <td className="px-6 py-4"><button onClick={() => { setSelectedSubmission(s); setGradeInput(''); setFeedbackInput(''); setAiWritingFeedback(null); }} className="text-indigo-600 font-medium">Grade</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="flex gap-6 flex-col lg:flex-row">
                    <div className="flex-1 bg-white p-6 rounded-xl shadow-sm">
                      <h3 className="font-bold mb-4">Student Work</h3>
                      
                      {/* INTEGRITY REPORT (NEW) */}
                      {selectedSubmission.metadata && (selectedSubmission.metadata.tabSwitches > 0 || selectedSubmission.metadata.pasteAttempts > 0) && (
                          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
                              <h4 className="flex items-center gap-2 text-red-700 font-bold mb-2">
                                  <ShieldAlert size={20} /> Integrity Report
                              </h4>
                              <div className="flex gap-6 text-sm">
                                  <div className="flex flex-col">
                                      <span className="text-slate-500 text-xs uppercase font-bold">Tab Switches</span>
                                      <span className={`font-bold ${selectedSubmission.metadata.tabSwitches > 0 ? 'text-red-700' : 'text-slate-700'}`}>
                                          {selectedSubmission.metadata.tabSwitches} detected
                                      </span>
                                  </div>
                                  <div className="flex flex-col">
                                      <span className="text-slate-500 text-xs uppercase font-bold">Copy/Paste Attempts</span>
                                      <span className={`font-bold ${selectedSubmission.metadata.pasteAttempts > 0 ? 'text-red-700' : 'text-slate-700'}`}>
                                          {selectedSubmission.metadata.pasteAttempts} detected
                                      </span>
                                  </div>
                              </div>
                          </div>
                      )}

                      {/* WRITING TASK RENDERER */}
                      {assignments.find(a => a.id === selectedSubmission.assignmentId)?.type === AssignmentType.WRITING ? (
                           <div className="space-y-4">
                               {aiWritingFeedback ? (
                                   <div className="prose prose-sm max-w-none">
                                       <h4 className="font-bold text-slate-800">Corrected Version (AI)</h4>
                                       <div 
                                            className="p-4 bg-slate-50 rounded border border-slate-200 leading-relaxed"
                                            dangerouslySetInnerHTML={{ __html: aiWritingFeedback.correctedEssay }}
                                       />
                                       <h4 className="font-bold text-slate-800 mt-4">Original Essay</h4>
                                       <div className="p-4 bg-white rounded border border-slate-200 text-slate-700 whitespace-pre-wrap">
                                            {selectedSubmission.answers['essay']}
                                       </div>
                                   </div>
                               ) : (
                                   <div className="p-4 bg-slate-50 rounded border border-slate-200 text-slate-900 whitespace-pre-wrap leading-relaxed">
                                       {selectedSubmission.answers['essay']}
                                   </div>
                               )}
                           </div>
                      ) : (
                          // STANDARD RENDERER
                          Object.entries(selectedSubmission.answers).map(([qId, ans]) => (
                            <div key={qId} className="mb-4 p-4 bg-slate-50 rounded">
                              {(ans as string).startsWith('data:') ? (
                                <div>
                                  <audio src={ans as string} controls className="w-full mb-2" />
                                  <button onClick={() => handleTranscribeSubmission(ans as string)} disabled={isTranscribing} className="text-xs text-indigo-600 flex items-center gap-1">{isTranscribing ? <Loader2 className="w-3 h-3 animate-spin"/> : <Sparkles className="w-3 h-3"/>} Transcribe</button>
                                  {transcription && <div className="mt-2 text-xs p-2 bg-white border rounded">{transcription}</div>}
                                </div>
                              ) : <p className="whitespace-pre-wrap">{ans as string}</p>}
                            </div>
                          ))
                      )}
                    </div>

                    <div className="w-full lg:w-96 bg-white p-6 rounded-xl shadow-sm h-fit">
                       <h3 className="font-bold mb-4">Score & Feedback</h3>
                       
                       {/* AI GRADE BUTTON FOR WRITING */}
                       {assignments.find(a => a.id === selectedSubmission.assignmentId)?.type === AssignmentType.WRITING && (
                           <button 
                                onClick={handleAiGradeWriting} 
                                disabled={isAiGrading} 
                                className="mb-4 w-full text-sm bg-purple-600 text-white px-3 py-2 rounded flex items-center justify-center gap-2 hover:bg-purple-700 transition-colors"
                            >
                                {isAiGrading ? <Loader2 className="w-4 h-4 animate-spin"/> : <Sparkles className="w-4 h-4"/>} 
                                AI Auto-Grade
                            </button>
                       )}
                       
                       {/* AI CRITERIA BREAKDOWN */}
                       {aiWritingFeedback && (
                           <div className="mb-4 p-3 bg-purple-50 rounded border border-purple-100 text-xs">
                               <div className="grid grid-cols-2 gap-2 mb-2">
                                   <div className="bg-white p-2 rounded">
                                       <div className="font-bold text-slate-500">TR/TA</div>
                                       <div className="text-lg font-bold text-purple-700">{aiWritingFeedback.criteria.taskAchievement.score}</div>
                                   </div>
                                   <div className="bg-white p-2 rounded">
                                       <div className="font-bold text-slate-500">C&C</div>
                                       <div className="text-lg font-bold text-purple-700">{aiWritingFeedback.criteria.coherenceCohesion.score}</div>
                                   </div>
                                   <div className="bg-white p-2 rounded">
                                       <div className="font-bold text-slate-500">LR</div>
                                       <div className="text-lg font-bold text-purple-700">{aiWritingFeedback.criteria.lexicalResource.score}</div>
                                   </div>
                                   <div className="bg-white p-2 rounded">
                                       <div className="font-bold text-slate-500">GRA</div>
                                       <div className="text-lg font-bold text-purple-700">{aiWritingFeedback.criteria.grammaticalRange.score}</div>
                                   </div>
                               </div>
                               <p className="text-slate-600 italic">
                                   "Feedback copied to inputs below. Review and Submit."
                               </p>
                           </div>
                       )}

                       {assignments.find(a => a.id === selectedSubmission.assignmentId)?.type !== AssignmentType.WRITING && (
                           <button onClick={handleAutoGrade} disabled={isAiGrading} className="mb-4 text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded flex items-center gap-1">{isAiGrading ? <Loader2 className="w-3 h-3 animate-spin"/> : <Sparkles className="w-3 h-3"/>} AI Suggest</button>
                       )}

                       <input className="w-full mb-2 p-2 border rounded bg-white text-slate-900" placeholder="Band Score" value={gradeInput} onChange={e => setGradeInput(e.target.value)} />
                       <textarea className="w-full mb-2 p-2 border rounded bg-white text-slate-900" rows={5} placeholder="Feedback" value={feedbackInput} onChange={e => setFeedbackInput(e.target.value)} />
                       <button onClick={() => { onGradeSubmission(selectedSubmission.id, gradeInput, feedbackInput, aiWritingFeedback); setSelectedSubmission(null); }} className="w-full py-2 bg-indigo-600 text-white rounded">Submit Result</button>
                    </div>
                  </div>
                )}
             </div>
          )}

          {/* Class Detail View */}
          {selectedClass && !showGrading && (
             <div className="min-h-screen bg-slate-50 flex flex-col -m-8 mt-0">
               <header className="bg-white shadow-sm px-6 py-4 flex justify-between items-center sticky top-0 z-10">
                 <div className="flex items-center gap-4">
                   <button onClick={() => setSelectedClassId(null)} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500"><X size={20} /></button>
                   <div><h1 className="text-xl font-bold text-slate-900">Managing: {selectedClass.name}</h1></div>
                 </div>
                 <div className="flex gap-2">
                    <button 
                        onClick={() => setShowGrading(true)} 
                        className="p-2 hover:bg-slate-100 rounded-full text-slate-600 relative"
                    >
                        <CheckSquare size={20}/>
                        {getClassPendingCount(selectedClass.id) > 0 && (
                            <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white"></span>
                        )}
                    </button>
                 </div>
               </header>
               <main className="flex-1 max-w-6xl mx-auto w-full p-6">
                 {/* ... (Existing tabs logic remains same) ... */}
                 <div className="flex space-x-1 mb-6 border-b border-slate-200">
                    {['overview', 'schedule', 'students', 'sessions', 'assignments', 'grades'].map((tab) => (
                      <button key={tab} onClick={() => setActiveTab(tab as any)} className={`px-4 py-3 text-sm font-medium capitalize border-b-2 ${activeTab === tab ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500'}`}>{tab}</button>
                    ))}
                 </div>
                 
                 {activeTab === 'overview' && (
                    <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-100 max-w-2xl relative">
                       <button onClick={openClassModalForEdit} className="absolute top-6 right-6 text-slate-400 hover:text-indigo-600 p-2"><Pencil size={18} /></button>
                       <h3 className="text-lg font-bold mb-4">Class Overview</h3>
                       <p className="text-slate-600 leading-relaxed">{selectedClass.description}</p>
                    </div>
                 )}
                 {activeTab === 'schedule' && (
                    <div className="space-y-4">
                      <div className="flex justify-between items-center"><h3 className="font-bold text-lg text-slate-800">Class Calendar</h3></div>
                      <Calendar events={events.filter(e => e.classId === selectedClassId)} onDateClick={(date) => setShowEventModal({ date })} />
                    </div>
                 )}
                 {activeTab === 'students' && (
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <h3 className="font-bold text-lg text-slate-800">Enrolled Students</h3>
                        <button onClick={handleOpenAddStudent} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2"><Plus size={16} /> Add Student</button>
                      </div>
                      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                        <table className="w-full text-left">
                          <thead className="bg-slate-50 border-b"><tr><th className="px-6 py-3 text-xs font-bold text-slate-500">Name</th><th className="px-6 py-3 text-xs font-bold text-slate-500">Access Code</th><th className="px-6 py-3 text-xs font-bold text-slate-500 w-10">Action</th></tr></thead>
                          <tbody>{students.filter(s => s.enrolledClassIds?.includes(selectedClassId!)).map(s => <tr key={s.id} className="hover:bg-slate-50"><td className="px-6 py-4">{s.name}</td><td className="px-6 py-4 font-mono text-sm">{s.accessCode}</td><td className="px-6 py-4"><button onClick={() => setStudentToRemove({id: s.id, name: s.name})} className="text-slate-400 hover:text-red-500 p-2"><Trash2 size={16}/></button></td></tr>)}</tbody>
                        </table>
                      </div>
                    </div>
                 )}
                 {activeTab === 'sessions' && (
                    <div className="space-y-6">
                      <div className="flex justify-between items-center">
                        <h3 className="font-bold text-lg text-slate-800">Sessions & Materials</h3>
                        <button onClick={() => setShowSessionModal(true)} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2"><Plus size={16} /> New Session</button>
                      </div>
                      {sessions.filter(s => s.classId === selectedClassId).map(session => (
                        <div key={session.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                           <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between">
                              <h4 className="font-bold text-slate-800">{session.title}</h4>
                              <button onClick={() => setShowMaterialModal({sessionId: session.id})} className="text-indigo-600 text-xs font-medium border border-indigo-200 px-2 py-1 rounded hover:bg-indigo-50">Add Material</button>
                           </div>
                           <div className="p-4 space-y-2">
                             {materials.filter(m => m.sessionId === session.id).map(mat => (
                               <div key={mat.id} className="flex items-center gap-3 p-2 hover:bg-slate-50 rounded"><div className="w-8 h-8 rounded bg-blue-50 text-blue-600 flex items-center justify-center">{mat.type === 'VIDEO' ? <Play size={16}/> : <LinkIcon size={16}/>}</div><a href={mat.url} target="_blank" rel="noreferrer" className="text-sm font-medium text-slate-700 hover:text-indigo-600 hover:text-indigo-600 hover:underline">{mat.title}</a></div>
                             ))}
                           </div>
                        </div>
                      ))}
                    </div>
                 )}

                 {/* ASSIGNMENTS TAB WITH FOLDERS */}
                 {activeTab === 'assignments' && (
                    <div className="space-y-4">
                      {/* Breadcrumbs / Header */}
                      <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                         <div className="flex items-center gap-2 text-sm font-medium">
                            <button onClick={() => setViewingGroupId(null)} className={`hover:text-indigo-600 ${!viewingGroupId ? 'text-indigo-900 font-bold' : 'text-slate-500'}`}>
                                Assignments
                            </button>
                            {viewingGroupId && (
                                <>
                                  <ChevronRight size={14} className="text-slate-400" />
                                  <span className="text-indigo-900 font-bold">
                                      {assignmentGroups.find(g => g.id === viewingGroupId)?.title}
                                  </span>
                                </>
                            )}
                         </div>
                         <div className="flex gap-2">
                            {!viewingGroupId && (
                                <button onClick={() => { setNewFolderTitle(''); setEditingFolderId(null); setShowFolderModal(true); }} className="text-sm bg-white border border-slate-300 text-slate-700 px-3 py-2 rounded-lg font-medium hover:bg-slate-50 flex items-center gap-2">
                                    <FolderPlus size={16} /> New Folder
                                </button>
                            )}
                            {viewingGroupId && (
                                <button 
                                    onClick={() => {
                                        setEditingAssignmentId(null);
                                        setNewAssignment({ type: AssignmentType.READING, classId: selectedClassId!, writingTaskType: 'TASK_1' });
                                        setTempQuestionGroups([]);
                                        setShowAssignmentModal(true);
                                    }} 
                                    className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2"
                                >
                                    <Plus size={16} /> Add Assignment
                                </button>
                            )}
                         </div>
                      </div>

                      {/* Content Area */}
                      {!viewingGroupId ? (
                          // FOLDER VIEW + LOOSE/ORPHANED ASSIGNMENTS
                          <div className="grid gap-4 md:grid-cols-3">
                              {/* Folders (Draggable) */}
                              {localGroups.map((group, index) => (
                                  <div 
                                      key={group.id} 
                                      draggable
                                      onDragStart={(e) => handleDragStart(e, index)}
                                      onDragOver={(e) => handleDragOver(e, index)}
                                      onDragEnd={handleDragEnd}
                                      onClick={() => setViewingGroupId(group.id)} 
                                      className={`bg-white p-5 rounded-xl border border-slate-200 shadow-sm cursor-pointer hover:border-indigo-400 hover:shadow-md transition-all group relative ${draggedGroupIndex === index ? 'opacity-50 border-dashed border-indigo-400' : ''}`}
                                  >
                                      {/* Drag Handle */}
                                      <div className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-300 cursor-grab opacity-0 group-hover:opacity-100 p-1 hover:text-slate-500">
                                          <GripVertical size={16} />
                                      </div>

                                      <div className="flex items-center gap-3 mb-2 pl-4">
                                          <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center">
                                              <Folder size={20} fill="currentColor" fillOpacity={0.2} />
                                          </div>
                                          <h4 className="font-bold text-slate-900 truncate pr-6">{group.title}</h4>
                                      </div>
                                      <p className="text-xs text-slate-500 pl-[56px]">
                                          {assignments.filter(a => a.groupId === group.id).length} Assignments
                                      </p>
                                      
                                      <div className="absolute top-3 right-2 flex opacity-0 group-hover:opacity-100 transition-opacity">
                                          <button 
                                            type="button"
                                            onClick={(e) => { e.stopPropagation(); handleOpenFolderEdit(group); }}
                                            className="text-slate-300 hover:text-indigo-600 p-2 z-10"
                                            title="Rename Folder"
                                          >
                                              <Pencil size={14} />
                                          </button>
                                          <button 
                                            type="button"
                                            onClick={(e) => { e.stopPropagation(); setDeleteFolderId(group.id); }}
                                            className="text-slate-300 hover:text-red-500 p-2 z-10"
                                            title="Delete Folder"
                                          >
                                              <Trash2 size={14} />
                                          </button>
                                      </div>
                                  </div>
                              ))}

                              {/* Loose Assignments (No Folder OR Invalid Folder) */}
                              {assignments.filter(a => {
                                  if (a.classId !== selectedClassId) return false;
                                  return !a.groupId || !assignmentGroups.some(g => g.id === a.groupId);
                              }).map(a => (
                                <div key={a.id} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm group relative">
                                   <div className="flex justify-between items-start mb-2">
                                      <span className="px-2 py-1 text-xs rounded font-medium bg-slate-100">{a.type}</span>
                                      <div className="flex gap-2 z-10 relative">
                                         <button type="button" onClick={(e) => { e.stopPropagation(); handleEditAssignment(a); }} className="text-slate-400 hover:text-indigo-600 p-2 rounded-full hover:bg-slate-100 transition-colors z-10 relative"><Pencil size={16} /></button>
                                         <button type="button" onClick={(e) => { e.stopPropagation(); handleDeleteAssignmentAction(a.id); }} className="text-slate-400 hover:text-red-500 p-2 rounded-full hover:bg-red-50 transition-colors z-10 relative"><Trash2 size={16} /></button>
                                      </div>
                                   </div>
                                   <h4 className="font-bold text-slate-900 mb-1">{a.title}</h4>
                                   <div className="text-xs text-slate-500 mt-2">Due {new Date(a.dueDate).toLocaleDateString()}</div>
                                   {!a.groupId ? (
                                       <span className="text-[10px] text-slate-400 italic block mt-2">No Folder</span>
                                   ) : (
                                       <span className="text-[10px] text-red-400 italic block mt-2 flex items-center gap-1"><AlertCircle size={10}/> Folder Missing</span>
                                   )}
                                </div>
                              ))}

                              {localGroups.length === 0 && 
                               assignments.filter(a => a.classId === selectedClassId && (!a.groupId || !assignmentGroups.some(g => g.id === a.groupId))).length === 0 && (
                                  <div className="col-span-3 text-center py-10 text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                                      No content yet. Create a Folder or Assignment.
                                  </div>
                              )}
                          </div>
                      ) : (
                          // ASSIGNMENT LIST VIEW (INSIDE FOLDER)
                          <div className="grid gap-4 md:grid-cols-3">
                             {assignments.filter(a => a.groupId === viewingGroupId).map(a => (
                                <div key={a.id} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm group relative">
                                   <div className="flex justify-between items-start mb-2">
                                      <span className="px-2 py-1 text-xs rounded font-medium bg-slate-100">{a.type}</span>
                                      <div className="flex gap-2 z-10 relative">
                                         <button type="button" onClick={(e) => { e.stopPropagation(); handleEditAssignment(a); }} className="text-slate-400 hover:text-indigo-600 p-2 rounded-full hover:bg-slate-100 transition-colors z-10 relative"><Pencil size={16} /></button>
                                         <button type="button" onClick={(e) => { e.stopPropagation(); handleDeleteAssignmentAction(a.id); }} className="text-slate-400 hover:text-red-500 p-2 rounded-full hover:bg-red-50 transition-colors z-10 relative"><Trash2 size={16} /></button>
                                      </div>
                                   </div>
                                   <h4 className="font-bold text-slate-900 mb-1">{a.title}</h4>
                                   <div className="text-xs text-slate-500 mt-2">Due {new Date(a.dueDate).toLocaleDateString()}</div>
                                </div>
                             ))}
                             {assignments.filter(a => a.groupId === viewingGroupId).length === 0 && (
                                 <div className="col-span-3 text-center py-10 text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                                     Empty folder. Add an assignment.
                                 </div>
                             )}
                          </div>
                      )}
                    </div>
                 )}

                 {/* NEW GRADES TAB */}
                 {activeTab === 'grades' && (
                    <Gradebook 
                        classId={selectedClassId!}
                        students={students.filter(s => s.enrolledClassIds?.includes(selectedClassId!))}
                        assignments={assignments.filter(a => a.classId === selectedClassId)}
                        submissions={submissions}
                    />
                 )}
               </main>
             </div>
          )}
       </div>

       {/* MODALS */}

       {/* CLASS DELETION CONFIRMATION MODAL */}
       {classToDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[80] animate-in fade-in backdrop-blur-sm">
            <div className="bg-white rounded-xl w-full max-w-sm p-6 shadow-2xl animate-in zoom-in-95 duration-200">
                {deleteStep === 1 && (
                    <div className="text-center space-y-4">
                        <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto text-red-500">
                            <Trash2 size={28} />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-slate-900">Delete Class?</h3>
                            <p className="text-slate-500 mt-2">
                                Are you sure you want to delete <span className="font-bold text-slate-800">{classToDelete.name}</span>?
                            </p>
                        </div>
                        <div className="flex gap-3 pt-2">
                            <button 
                                onClick={() => { setClassToDelete(null); setDeleteStep(0); }}
                                className="flex-1 py-2 bg-slate-100 text-slate-700 font-bold rounded-lg hover:bg-slate-200"
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={() => setDeleteStep(2)}
                                className="flex-1 py-2 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 shadow-md"
                            >
                                Proceed
                            </button>
                        </div>
                    </div>
                )}

                {deleteStep === 2 && (
                    <div className="text-center space-y-4">
                         <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto text-red-600 border-4 border-red-50 animate-pulse">
                            <AlertTriangle size={28} />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-red-600">Final Warning</h3>
                            <p className="text-slate-600 mt-2 text-sm leading-relaxed">
                                This action is <span className="font-bold">irreversible</span>. All students will be removed, and all assignments, submissions, and grades will be <span className="font-bold underline decoration-red-300">permanently deleted</span>.
                            </p>
                        </div>
                        <div className="flex gap-3 pt-2">
                            <button 
                                onClick={() => { setClassToDelete(null); setDeleteStep(0); }}
                                className="flex-1 py-2 bg-slate-100 text-slate-700 font-bold rounded-lg hover:bg-slate-200"
                            >
                                Abort
                            </button>
                            <button 
                                onClick={confirmDeleteClass}
                                className="flex-1 py-2 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 shadow-lg shadow-red-200"
                            >
                                Delete Forever
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
       )}

       {/* PREVIEW MODAL */}
       {showPreviewModal && (
           <div className="fixed inset-0 bg-black/50 z-[100] animate-in fade-in">
               <AssignmentViewer 
                   assignment={getPreviewAssignment()}
                   answers={previewAnswers}
                   onAnswerChange={(id, val) => setPreviewAnswers(prev => ({...prev, [id]: val}))}
                   onSubmit={() => setShowPreviewModal(false)}
                   onExit={() => setShowPreviewModal(false)}
                   isTeacherPreview={true}
               />
           </div>
       )}
       
       {/* Remove Student Confirmation Modal */}
       {studentToRemove && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[60]">
            <div className="bg-white rounded-xl w-full max-w-sm p-6 animate-in zoom-in-95 duration-200">
                <div className="flex flex-col items-center text-center gap-4">
                    <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center text-red-600">
                        <Trash2 size={24} />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-slate-900">Remove Student?</h3>
                        <p className="text-slate-500 mt-2 text-sm">
                            Are you sure you want to remove <strong>{studentToRemove.name}</strong> from this class?
                        </p>
                    </div>
                    <div className="flex gap-3 w-full mt-2">
                        <button 
                            onClick={() => setStudentToRemove(null)} 
                            className="flex-1 py-2.5 bg-slate-100 text-slate-700 font-medium rounded-lg hover:bg-slate-200 transition-colors"
                        >
                            Cancel
                        </button>
                        <button 
                            onClick={handleConfirmRemoveStudent} 
                            className="flex-1 py-2.5 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 shadow-lg shadow-red-200 transition-colors"
                        >
                            Remove
                        </button>
                    </div>
                </div>
            </div>
        </div>
       )}

       {/* Create/Edit Folder Modal */}
       {showFolderModal && (
           <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
               <div className="bg-white rounded-xl w-full max-w-sm p-6">
                   <h3 className="text-lg font-bold mb-4">{editingFolderId ? 'Edit Folder Name' : 'Create Assignment Group'}</h3>
                   <input 
                      className="w-full p-2 border rounded bg-white text-slate-900 mb-4" 
                      placeholder="e.g. Homework Week 1" 
                      value={newFolderTitle} 
                      onChange={e => setNewFolderTitle(e.target.value)}
                      autoFocus
                   />
                   <div className="flex gap-2">
                       <button onClick={() => { setShowFolderModal(false); setEditingFolderId(null); setNewFolderTitle(''); }} className="flex-1 py-2 text-slate-600 bg-slate-100 rounded">Cancel</button>
                       <button onClick={handleSaveFolder} className="flex-1 py-2 bg-indigo-600 text-white rounded font-bold">{editingFolderId ? 'Update' : 'Create'}</button>
                   </div>
               </div>
           </div>
       )}
       
       {/* JSON Import Modal */}
       {showJsonImportModal && (
           <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[60]">
               <div className="bg-white rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col animate-in zoom-in-95 duration-200">
                   <div className="p-6 border-b flex justify-between items-center">
                       <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                           <ClipboardPaste size={20} /> Import from JSON
                       </h3>
                       <button onClick={() => setShowJsonImportModal(false)}><X className="w-5 h-5 text-slate-400"/></button>
                   </div>
                   <div className="p-6 flex-1 overflow-y-auto">
                       <textarea 
                          className="w-full h-full min-h-[300px] p-4 border rounded bg-white text-slate-900 font-mono text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                          placeholder="Paste the JSON generated by your external AI tool here..."
                          value={jsonInput}
                          onChange={(e) => setJsonInput(e.target.value)}
                       />
                   </div>
                   <div className="p-6 border-t bg-slate-50 flex justify-end gap-3">
                       <button onClick={() => setShowJsonImportModal(false)} className="px-4 py-2 text-slate-600 hover:text-slate-900">Cancel</button>
                       <button onClick={handleJsonImport} className="px-6 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 font-bold">Import Data</button>
                   </div>
               </div>
           </div>
       )}

       {/* Delete Confirmation Modal */}
       {(deleteConfirmationId || deleteFolderId) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[60]">
            <div className="bg-white rounded-xl w-full max-w-sm p-6 animate-in zoom-in-95 duration-200">
                <div className="flex flex-col items-center text-center gap-4">
                    <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center text-red-600">
                        <Trash2 size={24} />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-slate-900">Delete {deleteFolderId ? 'Folder' : 'Assignment'}?</h3>
                        <p className="text-slate-500 mt-2 text-sm">Are you sure? This cannot be undone.</p>
                    </div>
                    <div className="flex gap-3 w-full mt-2">
                        <button 
                            onClick={() => { setDeleteConfirmationId(null); setDeleteFolderId(null); }} 
                            className="flex-1 py-2.5 bg-slate-100 text-slate-700 font-medium rounded-lg hover:bg-slate-200 transition-colors"
                        >
                            Cancel
                        </button>
                        <button 
                            onClick={deleteFolderId ? handleDeleteFolder : confirmDeleteAssignment} 
                            className="flex-1 py-2.5 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 shadow-lg shadow-red-200 transition-colors"
                        >
                            Delete
                        </button>
                    </div>
                </div>
            </div>
        </div>
       )}

       {showClassModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
           <div className="bg-white rounded-xl w-full max-w-md animate-in fade-in zoom-in duration-200">
             <div className="p-6 border-b flex justify-between items-center">
               <h3 className="text-xl font-bold">{editingClassId ? 'Edit Class & Schedule' : 'New Class'}</h3>
               <button onClick={() => setShowClassModal(false)}><X className="w-5 h-5 text-slate-400"/></button>
             </div>
             <div className="p-6 space-y-4">
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Class Name</label><input className="w-full p-2 border rounded bg-white text-slate-900" value={newClass.name || ''} onChange={e => setNewClass({...newClass, name: e.target.value})} /></div>
                <div className="bg-slate-50 p-4 rounded border border-slate-200">
                  <label className="block text-xs font-bold text-indigo-600 uppercase mb-3">Weekly Schedule</label>
                  {scheduleItems.map((item, idx) => (<div key={idx} className="flex justify-between items-center bg-white p-2 border rounded shadow-sm text-sm mb-2"><span className="font-medium">{item.day}</span><span className="text-slate-500">{item.startTime} - {item.endTime}</span><button onClick={() => removeScheduleSlot(idx)} className="text-red-400 p-1"><X size={14}/></button></div>))}
                  <div className="grid grid-cols-1 gap-2 mt-2">
                    <select className="w-full p-2 border rounded text-sm bg-white text-slate-900" value={tempDay} onChange={(e) => setTempDay(e.target.value)}>{['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(d => (<option key={d} value={d}>{d}</option>))}</select>
                    <div className="flex gap-2 items-center"><input type="time" className="w-full p-2 border rounded text-sm bg-white text-slate-900" value={tempStart} onChange={e => setTempStart(e.target.value)} /><span className="text-slate-400">-</span><input type="time" className="w-full p-2 border rounded text-sm bg-white text-slate-900" value={tempEnd} onChange={e => setTempEnd(e.target.value)} /><button onClick={addScheduleSlot} className="bg-indigo-600 text-white p-2 rounded hover:bg-indigo-700"><Plus size={16}/></button></div>
                  </div>
                </div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Description</label><textarea className="w-full p-2 border rounded bg-white text-slate-900" value={newClass.description || ''} onChange={e => setNewClass({...newClass, description: e.target.value})} /></div>
                <button onClick={handleSaveClass} className="w-full py-2 bg-indigo-600 text-white rounded font-medium">{editingClassId ? 'Update Class' : 'Create Class'}</button>
             </div>
           </div>
        </div>
       )}

       {showStudentModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
           <div className="bg-white rounded-xl w-full max-w-md">
             <div className="p-6 border-b flex justify-between items-center"><h3 className="text-xl font-bold">Add Student</h3><button onClick={() => setShowStudentModal(false)}><X className="w-5 h-5 text-slate-400"/></button></div>
             <div className="p-6 space-y-4">
                <input className="w-full p-2 border rounded bg-white text-slate-900" placeholder="Full Name" value={newStudent.name || ''} onChange={e => setNewStudent({...newStudent, name: e.target.value})} />
                
                {/* Access Code Generation UI */}
                <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Access Code (Auto-generated)</label>
                    <div className="relative">
                        <input 
                            className="w-full p-2 border rounded bg-slate-50 text-slate-600 font-mono font-bold tracking-widest text-center" 
                            value={newStudent.accessCode || ''} 
                            readOnly
                        />
                        <button 
                            onClick={() => setNewStudent(prev => ({...prev, accessCode: generateAccessCode()}))}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-200 rounded-full transition-colors"
                            title="Regenerate Code"
                        >
                            <RefreshCw size={16} />
                        </button>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1">Unique 6-digit code for student login.</p>
                </div>

                <button onClick={handleSaveStudent} className="w-full py-2 bg-indigo-600 text-white rounded font-medium">Save Student</button>
             </div>
           </div>
        </div>
       )}

       {showSessionModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
           <div className="bg-white rounded-xl w-full max-w-md">
             <div className="p-6 border-b flex justify-between items-center"><h3 className="text-xl font-bold">New Session</h3><button onClick={() => setShowSessionModal(false)}><X className="w-5 h-5 text-slate-400"/></button></div>
             <div className="p-6 space-y-4">
                <input className="w-full p-2 border rounded bg-white text-slate-900" placeholder="Session Title" value={newSession.title || ''} onChange={e => setNewSession({...newSession, title: e.target.value})} />
                <textarea className="w-full p-2 border rounded bg-white text-slate-900" placeholder="Objectives..." value={newSession.description || ''} onChange={e => setNewSession({...newSession, description: e.target.value})} />
                <button onClick={handleSaveSession} className="w-full py-2 bg-indigo-600 text-white rounded font-medium">Create Session</button>
             </div>
           </div>
        </div>
       )}

       {showMaterialModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
           <div className="bg-white rounded-xl w-full max-w-md">
             <div className="p-6 border-b flex justify-between items-center"><h3 className="text-xl font-bold">Add Material</h3><button onClick={() => setShowMaterialModal(null)}><X className="w-5 h-5 text-slate-400"/></button></div>
             <div className="p-6 space-y-4">
                <input className="w-full p-2 border rounded bg-white text-slate-900" placeholder="Title" value={newMaterial.title || ''} onChange={e => setNewMaterial({...newMaterial, title: e.target.value})} />
                <select className="w-full p-2 border rounded bg-white text-slate-900" value={newMaterial.type} onChange={e => setNewMaterial({...newMaterial, type: e.target.value as any})}><option value="LINK">Web Link</option><option value="VIDEO">Video URL</option><option value="FILE">File</option></select>
                <input className="w-full p-2 border rounded bg-white text-slate-900" placeholder="URL" value={newMaterial.url || ''} onChange={e => setNewMaterial({...newMaterial, url: e.target.value})} />
                <button onClick={handleSaveMaterial} className="w-full py-2 bg-indigo-600 text-white rounded font-medium">Add Material</button>
             </div>
           </div>
        </div>
       )}

       {showEventModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
           <div className="bg-white rounded-xl w-full max-w-md">
             <div className="p-6 border-b flex justify-between items-center"><h3 className="text-xl font-bold">Add Event</h3><button onClick={() => setShowEventModal(null)}><X className="w-5 h-5 text-slate-400"/></button></div>
             <div className="p-6 space-y-4">
                <input className="w-full p-2 border rounded bg-white text-slate-900" placeholder="Title" value={newEvent.title || ''} onChange={e => setNewEvent({...newEvent, title: e.target.value})} />
                <div className="flex gap-2"><input type="time" className="w-full p-2 border rounded bg-white text-slate-900" value={newEvent.startTime || ''} onChange={e => setNewEvent({...newEvent, startTime: e.target.value})} /><input type="time" className="w-full p-2 border rounded bg-white text-slate-900" value={newEvent.endTime || ''} onChange={e => setNewEvent({...newEvent, endTime: e.target.value})} /></div>
                <select className="w-full p-2 border rounded bg-white text-slate-900" value={newEvent.type} onChange={e => setNewEvent({...newEvent, type: e.target.value as any})}><option value="CLASS">Class</option><option value="EXAM">Exam</option><option value="DEADLINE">Deadline</option></select>
                <button onClick={handleSaveEvent} className="w-full py-2 bg-indigo-600 text-white rounded font-medium">Save Event</button>
             </div>
           </div>
        </div>
       )}

      {/* NEW ASSIGNMENT MODAL (SKILL BASED) */}
      {showAssignmentModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200">
             {/* Header */}
             <div className="p-6 border-b flex justify-between items-center sticky top-0 bg-white z-10">
               <div>
                  <h3 className="text-xl font-bold">{editingAssignmentId ? 'Edit Assignment' : 'Create Assignment'}</h3>
                  <p className="text-xs text-slate-500 mt-1">{assignmentGroups.find(g => g.id === viewingGroupId)?.title || 'Uncategorized'}</p>
               </div>
               <div className="flex items-center gap-3">
                    <button 
                        onClick={handleOpenPreview}
                        className="text-sm bg-indigo-50 text-indigo-700 px-3 py-2 rounded-lg font-bold hover:bg-indigo-100 flex items-center gap-2 border border-indigo-200"
                    >
                        <Eye size={16} /> Preview
                    </button>
                    <button onClick={() => setShowAssignmentModal(false)} className="text-slate-400 hover:text-slate-600"><X/></button>
               </div>
             </div>
             
             <div className="p-6 space-y-8">
                {/* 1. Skill Selection (Locked if editing) */}
                {!editingAssignmentId && (
                    <div className="space-y-2">
                        <label className="block text-sm font-bold text-slate-700">Select Skill</label>
                        <div className="grid grid-cols-4 gap-4">
                            {[AssignmentType.READING, AssignmentType.LISTENING, AssignmentType.WRITING, AssignmentType.SPEAKING].map(type => (
                                <button 
                                    key={type}
                                    onClick={() => {
                                        const update: Partial<Assignment> = { ...newAssignment, type };
                                        if (type === AssignmentType.WRITING) {
                                            if (!update.writingTaskType) update.writingTaskType = 'TASK_1';
                                            // Set default time limits
                                            update.timeLimit = update.writingTaskType === 'TASK_1' ? 20 : 40;
                                        }
                                        setNewAssignment(update);
                                    }}
                                    className={`p-4 border rounded-xl flex flex-col items-center gap-2 transition-all ${newAssignment.type === type ? 'bg-indigo-50 border-indigo-600 text-indigo-700 ring-2 ring-indigo-200' : 'hover:bg-slate-50'}`}
                                >
                                    <span className="font-bold text-sm">{type}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* 2. Basic Info */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                     <div>
                        <label className="block text-sm font-medium mb-1">Assignment Title</label>
                        <input className="w-full p-2 border rounded bg-white text-slate-900" placeholder={newAssignment.type === AssignmentType.READING ? "e.g. Reading Passage 1" : "Assignment Title"} value={newAssignment.title || ''} onChange={e => setNewAssignment({...newAssignment, title: e.target.value})} />
                     </div>
                     <div className="relative">
                        <label className="block text-sm font-medium mb-1">Due Date</label>
                        <button 
                          onClick={() => setShowDatePicker(!showDatePicker)}
                          className="w-full p-2 border rounded bg-white text-slate-900 flex items-center justify-between hover:border-indigo-300 transition-colors"
                        >
                          <span className={newAssignment.dueDate ? 'text-slate-900' : 'text-slate-400'}>
                            {newAssignment.dueDate ? new Date(newAssignment.dueDate).toLocaleDateString() : 'Select Due Date'}
                          </span>
                          <CalendarIcon size={16} className="text-slate-400"/>
                        </button>
                        {showDatePicker && (
                          <div className="absolute top-full left-0 mt-1 w-full md:w-[320px] bg-white rounded-xl shadow-2xl border border-slate-200 z-50 p-2 animate-in fade-in zoom-in-95">
                             <Calendar 
                                events={events} 
                                readOnly 
                                compact 
                                onDateClick={(date) => {
                                   setNewAssignment({...newAssignment, dueDate: date});
                                   setShowDatePicker(false);
                                }} 
                             />
                          </div>
                        )}
                     </div>
                </div>

                {/* 3. READING MODULE SPECIFIC FIELDS */}
                {newAssignment.type === AssignmentType.READING && (
                    <div className="space-y-6">
                        {/* Passage Content */}
                        <div>
                            <div className="flex justify-between items-center mb-2">
                               <label className="block text-sm font-bold text-slate-700">Reading Passage Content</label>
                               <div className="flex items-center gap-2">
                                   <button 
                                      onClick={handleAiImportClick}
                                      disabled={isImporting}
                                      className="text-xs bg-gradient-to-r from-purple-500 to-indigo-600 text-white px-3 py-1.5 rounded-lg font-bold hover:shadow-md flex items-center gap-2 transition-all disabled:opacity-50"
                                      title="Import from Image/PDF"
                                   >
                                      {isImporting && <Loader2 size={14} className="animate-spin" />}
                                      {isImporting ? 'Extracting...' : '✨ AI Import'}
                                   </button>
                                   <button
                                      onClick={() => setShowJsonImportModal(true)}
                                      className="text-xs bg-slate-600 text-white px-3 py-1.5 rounded-lg font-bold hover:bg-slate-700 flex items-center gap-2 transition-all"
                                      title="Paste JSON from external tool"
                                   >
                                      <ClipboardPaste size={14} /> Paste JSON
                                   </button>
                                   <input 
                                      type="file" 
                                      ref={aiImportInputRef}
                                      className="hidden"
                                      accept="image/png, image/jpeg, image/webp, application/pdf"
                                      onChange={handleAiImportFileChange}
                                   />
                               </div>
                            </div>
                            <RichTextEditor
                                value={newAssignment.passageContent || ''}
                                onChange={val => setNewAssignment({...newAssignment, passageContent: val})}
                                placeholder="Paste the reading passage text here..."
                                className="h-96"
                            />
                        </div>

                        <hr />

                        {/* Question Groups Builder */}
                        <div>
                            <div className="flex justify-between items-center mb-4">
                                <h4 className="text-lg font-bold text-slate-800">Question Groups</h4>
                                <button onClick={handleAddQuestionGroup} className="text-sm bg-indigo-50 text-indigo-700 px-3 py-2 rounded-lg font-medium hover:bg-indigo-100 flex items-center gap-2">
                                    <Plus size={16}/> Add Question Group
                                </button>
                            </div>

                            <div className="space-y-6">
                                {tempQuestionGroups.map((group, gIdx) => (
                                    <div key={group.id} className="border border-slate-200 rounded-xl overflow-hidden">
                                        {/* Group Header */}
                                        <div className="bg-slate-50 p-4 border-b border-slate-200 flex flex-col gap-3">
                                            <div className="flex gap-4">
                                                <div className="flex-1 space-y-2">
                                                    <div className="flex gap-2">
                                                        <select
                                                            className="font-bold text-slate-900 bg-transparent border-b border-transparent hover:border-slate-300 w-1/3"
                                                            value={group.type}
                                                            onChange={(e) => handleGroupTypeChange(gIdx, e.target.value)}
                                                        >
                                                            <option value="MCQ">Multiple Choice</option>
                                                            <option value="FILL_IN_BLANKS">Sentence Completion (Fill in Blanks)</option>
                                                            <option value="NOTES_COMPLETION">Notes Completion</option>
                                                            <option value="TRUE_FALSE_NG">True/False/NG</option>
                                                            <option value="YES_NO_NG">Yes/No/NG</option>
                                                            <option value="MATCHING_HEADINGS">Matching Headings</option>
                                                            <option value="MATCHING_FEATURES">Matching Features</option>
                                                            <option value="MATCHING_INFORMATION">Matching Information</option>
                                                            <option value="MATCHING_SENTENCE_ENDINGS">Matching Sentence Endings</option>
                                                        </select>
                                                        <input 
                                                            className="font-bold text-slate-900 bg-transparent border-b border-transparent hover:border-slate-300 flex-1"
                                                            value={group.title || `Group ${gIdx+1}`}
                                                            onChange={e => {
                                                                const u = [...tempQuestionGroups];
                                                                u[gIdx].title = e.target.value;
                                                                setTempQuestionGroups(u);
                                                            }}
                                                            placeholder="Group Title (e.g. Questions 1-5)"
                                                        />
                                                    </div>
                                                    <input 
                                                        className="text-sm text-slate-600 bg-transparent border-b border-transparent hover:border-slate-300 w-full"
                                                        value={group.instruction}
                                                        onChange={e => {
                                                            const u = [...tempQuestionGroups];
                                                            u[gIdx].instruction = e.target.value;
                                                            setTempQuestionGroups(u);
                                                        }}
                                                        placeholder="Instruction (e.g. Choose the correct letter...)"
                                                    />
                                                </div>
                                                <button onClick={() => {
                                                    const u = [...tempQuestionGroups];
                                                    u.splice(gIdx, 1);
                                                    setTempQuestionGroups(u);
                                                }} className="text-slate-400 hover:text-red-500"><Trash2 size={18}/></button>
                                            </div>
                                        </div>

                                        {/* Questions inside Group */}
                                        <div className="p-4 bg-white">
                                            {/* RICH TEXT EDITOR FOR NOTES COMPLETION */}
                                            {group.type === 'NOTES_COMPLETION' ? (
                                                <div className="space-y-2">
                                                   <label className="text-sm font-bold text-slate-700">Note Content</label>
                                                   <RichTextEditor
                                                      value={group.content || ''}
                                                      onChange={(val) => {
                                                           const u = [...tempQuestionGroups];
                                                           u[gIdx].content = val;
                                                           setTempQuestionGroups(u);
                                                      }}
                                                      placeholder="Enter note content here. Use [brackets]. e.g. The [cat] sat on the mat."
                                                   />
                                                   <p className="text-xs text-slate-500">
                                                      Type the text and wrap answers in [brackets]. Questions will be generated automatically upon saving.
                                                   </p>
                                                </div>
                                            ) : (
                                                /* Standard Question List for other types */
                                                <>
                                                    {/* MATCHING HEADINGS LIST BUILDER */}
                                                    {group.type === 'MATCHING_HEADINGS' && (
                                                        <div className="mb-6 p-4 bg-indigo-50/50 rounded-xl border border-indigo-100">
                                                            <h5 className="font-bold text-sm text-indigo-900 mb-2">Manage List of Headings</h5>
                                                            <div className="space-y-2 mb-3">
                                                                {group.headingList?.map((h, hIdx) => (
                                                                    <div key={hIdx} className="flex items-center gap-2">
                                                                        <span className="font-bold text-xs text-indigo-600 w-6 text-right">{toRoman(hIdx+1)}</span>
                                                                        <span className="flex-1 text-sm bg-white px-2 py-1 rounded border border-indigo-100">{h}</span>
                                                                        <button onClick={() => removeHeadingFromGroup(gIdx, hIdx)} className="text-slate-400 hover:text-red-500"><X size={14}/></button>
                                                                    </div>
                                                                ))}
                                                                {(!group.headingList || group.headingList.length === 0) && <p className="text-xs text-slate-400 italic">No headings added yet.</p>}
                                                            </div>
                                                            <div className="flex gap-2">
                                                                <input 
                                                                    className="flex-1 p-2 border rounded text-sm bg-white"
                                                                    placeholder="Enter new heading text..."
                                                                    value={tempHeadingInput}
                                                                    onChange={e => setTempHeadingInput(e.target.value)}
                                                                />
                                                                <button onClick={() => addHeadingToGroup(gIdx)} className="bg-indigo-600 text-white px-4 rounded text-sm font-medium">Add</button>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* MATCHING FEATURES / SENTENCE ENDINGS LIST BUILDER */}
                                                    {(group.type === 'MATCHING_FEATURES' || group.type === 'MATCHING_SENTENCE_ENDINGS') && (
                                                        <div className="mb-6 p-4 bg-indigo-50/50 rounded-xl border border-indigo-100">
                                                            <h5 className="font-bold text-sm text-indigo-900 mb-2">
                                                                {group.type === 'MATCHING_SENTENCE_ENDINGS' ? 'Manage Sentence Endings' : 'Manage List of Options (e.g. Researchers)'}
                                                            </h5>
                                                            <div className="space-y-2 mb-3">
                                                                {group.matchOptions?.map((opt, optIdx) => (
                                                                    <div key={optIdx} className="flex items-center gap-2">
                                                                        <span className="font-bold text-xs text-indigo-600 w-6 text-right">{toLetter(optIdx)}</span>
                                                                        <span className="flex-1 text-sm bg-white px-2 py-1 rounded border border-indigo-100">{opt}</span>
                                                                        <button onClick={() => removeMatchOptionFromGroup(gIdx, optIdx)} className="text-slate-400 hover:text-red-500"><X size={14}/></button>
                                                                    </div>
                                                                ))}
                                                                {(!group.matchOptions || group.matchOptions.length === 0) && <p className="text-xs text-slate-400 italic">No options added yet.</p>}
                                                            </div>
                                                            <div className="flex gap-2">
                                                                <input 
                                                                    className="flex-1 p-2 border rounded text-sm bg-white"
                                                                    placeholder={group.type === 'MATCHING_SENTENCE_ENDINGS' ? "Enter ending text..." : "Enter new option text..."}
                                                                    value={tempMatchOptionInput}
                                                                    onChange={e => setTempMatchOptionInput(e.target.value)}
                                                                />
                                                                <button onClick={() => addMatchOptionToGroup(gIdx)} className="bg-indigo-600 text-white px-4 rounded text-sm font-medium">Add</button>
                                                            </div>
                                                        </div>
                                                    )}

                                                    <div className="space-y-3 mb-4">
                                                        {group.questions.map((q, qIdx) => (
                                                            <div key={q.id} className="flex items-center gap-3 p-2 bg-slate-50 rounded border border-slate-100">
                                                                <span className="text-xs font-bold text-slate-400">{qIdx+1}</span>
                                                                <span className="flex-1 text-sm font-medium">{q.text}</span>
                                                                
                                                                {/* Inline Answer Editor for MCQ */}
                                                                {group.type === 'MCQ' && q.options && !q.maxSelection && (
                                                                    <select 
                                                                        value={q.correctAnswer || ''}
                                                                        onChange={(e) => updateQuestionAnswer(gIdx, q.id, e.target.value)}
                                                                        className="text-xs font-bold text-slate-700 bg-white border border-slate-300 rounded px-2 py-1 outline-none focus:border-indigo-500 w-20"
                                                                    >
                                                                        <option value="" disabled>Ans</option>
                                                                        {q.options.map((_, i) => (
                                                                             <option key={i} value={toLetter(i)}>{toLetter(i)}</option>
                                                                        ))}
                                                                    </select>
                                                                )}
                                                                {group.type === 'MCQ' && q.options && q.maxSelection && q.maxSelection > 1 && (
                                                                    <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded">{q.correctAnswer}</span>
                                                                )}

                                                                {/* Inline Answer Editor for T/F/NG */}
                                                                {group.type === 'TRUE_FALSE_NG' && (
                                                                    <select 
                                                                        value={q.correctAnswer || ''}
                                                                        onChange={(e) => updateQuestionAnswer(gIdx, q.id, e.target.value)}
                                                                        className="text-xs font-bold text-slate-700 bg-white border border-slate-300 rounded px-2 py-1 outline-none focus:border-indigo-500"
                                                                    >
                                                                        <option value="" disabled>Select Answer</option>
                                                                        <option value="TRUE">TRUE</option>
                                                                        <option value="FALSE">FALSE</option>
                                                                        <option value="NOT GIVEN">NOT GIVEN</option>
                                                                    </select>
                                                                )}

                                                                {/* Inline Answer Editor for YES/NO/NG */}
                                                                {group.type === 'YES_NO_NG' && (
                                                                    <select 
                                                                        value={q.correctAnswer || ''}
                                                                        onChange={(e) => updateQuestionAnswer(gIdx, q.id, e.target.value)}
                                                                        className="text-xs font-bold text-slate-700 bg-white border border-slate-300 rounded px-2 py-1 outline-none focus:border-indigo-500"
                                                                    >
                                                                        <option value="" disabled>Select Answer</option>
                                                                        <option value="YES">YES</option>
                                                                        <option value="NO">NO</option>
                                                                        <option value="NOT GIVEN">NOT GIVEN</option>
                                                                    </select>
                                                                )}
                                                                
                                                                {/* Inline Answer Editor for Matching Headings */}
                                                                {group.type === 'MATCHING_HEADINGS' && (
                                                                    <select 
                                                                        value={q.correctAnswer || ''}
                                                                        onChange={(e) => updateQuestionAnswer(gIdx, q.id, e.target.value)}
                                                                        className="text-xs font-bold text-slate-700 bg-white border border-slate-300 rounded px-2 py-1 outline-none focus:border-indigo-500 w-20"
                                                                    >
                                                                        <option value="" disabled>Ans</option>
                                                                        {group.headingList?.map((_, i) => (
                                                                             <option key={i} value={toRoman(i+1)}>{toRoman(i+1)}</option>
                                                                        ))}
                                                                    </select>
                                                                )}
                                                                
                                                                {/* Inline Answer Editor for Matching Features / Sentence Endings */}
                                                                {(group.type === 'MATCHING_FEATURES' || group.type === 'MATCHING_SENTENCE_ENDINGS') && (
                                                                    <select 
                                                                        value={q.correctAnswer || ''}
                                                                        onChange={(e) => updateQuestionAnswer(gIdx, q.id, e.target.value)}
                                                                        className="text-xs font-bold text-slate-700 bg-white border border-slate-300 rounded px-2 py-1 outline-none focus:border-indigo-500 w-20"
                                                                    >
                                                                        <option value="" disabled>Ans</option>
                                                                        {group.matchOptions?.map((_, i) => (
                                                                             <option key={i} value={toLetter(i)}>{toLetter(i)}</option>
                                                                        ))}
                                                                    </select>
                                                                )}

                                                                {/* Inline Answer Editor for Matching Information */}
                                                                {group.type === 'MATCHING_INFORMATION' && (
                                                                    <select 
                                                                        value={q.correctAnswer || ''}
                                                                        onChange={(e) => updateQuestionAnswer(gIdx, q.id, e.target.value)}
                                                                        className="text-xs font-bold text-slate-700 bg-white border border-slate-300 rounded px-2 py-1 outline-none focus:border-indigo-500 w-20"
                                                                    >
                                                                        <option value="" disabled>Ans</option>
                                                                        {['A','B','C','D','E','F','G','H'].map(letter => (
                                                                             <option key={letter} value={letter}>{letter}</option>
                                                                        ))}
                                                                    </select>
                                                                )}

                                                                <button onClick={() => removeQuestionFromGroup(gIdx, q.id)} className="text-slate-400 hover:text-red-500"><X size={14}/></button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                    
                                                    {/* Add Question Area */}
                                                    {activeGroupIndex === gIdx ? (
                                                        <div className="bg-indigo-50/50 p-4 rounded-xl border border-indigo-100 animate-in fade-in">
                                                            <div className="space-y-3">
                                                                {/* Dynamic Input Based on Group Type */}
                                                                {group.type === 'MCQ' ? (
                                                                    <>
                                                                        <input className="w-full p-2 border rounded text-sm bg-white text-slate-900" placeholder="Question Text" value={tempQuestionText} onChange={e => setTempQuestionText(e.target.value)} />
                                                                        <div className="flex items-center gap-2 mb-2">
                                                                            <label className="text-xs font-bold text-slate-600">Answers to select:</label>
                                                                            <input 
                                                                                type="number" 
                                                                                min="1" 
                                                                                max="4" 
                                                                                className="w-16 p-1 border rounded text-sm bg-white text-center"
                                                                                value={tempMaxSelection}
                                                                                onChange={(e) => {
                                                                                    let val = parseInt(e.target.value);
                                                                                    if (isNaN(val) || val < 1) val = 1;
                                                                                    if (val > 4) val = 4;
                                                                                    setTempMaxSelection(val);
                                                                                    setTempCorrectAnswer(null); // Reset selection when type changes
                                                                                }}
                                                                            />
                                                                        </div>
                                                                        <div className="space-y-2 pl-4 border-l-2 border-indigo-200">
                                                                            <div className="flex gap-2">
                                                                                <input className="flex-1 p-1 px-2 text-sm border rounded bg-white text-slate-900" placeholder="Option..." value={tempOptionInput} onChange={e => setTempOptionInput(e.target.value)}/>
                                                                                <button onClick={() => {if(tempOptionInput){setTempMcqOptions([...tempMcqOptions, tempOptionInput]); setTempOptionInput('')}}} className="text-xs bg-slate-200 px-2 rounded">Add</button>
                                                                            </div>
                                                                            {tempMcqOptions.map((opt, idx) => (
                                                                                <div key={idx} className="flex gap-2 text-sm items-center">
                                                                                     <span className="font-bold text-indigo-600 w-5">{toLetter(idx)}</span>
                                                                                     <span className="flex-1">{opt}</span>
                                                                                     <label className="flex items-center gap-1 cursor-pointer select-none">
                                                                                         {tempMaxSelection > 1 ? (
                                                                                             <div 
                                                                                                className={`w-4 h-4 border rounded flex items-center justify-center ${tempCorrectAnswer?.split(',').includes(toLetter(idx)) ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-slate-300'}`}
                                                                                                onClick={() => toggleMcqCorrectAnswer(toLetter(idx))}
                                                                                             >
                                                                                                 {tempCorrectAnswer?.split(',').includes(toLetter(idx)) && <CheckSquare size={12} className="text-white" />}
                                                                                             </div>
                                                                                         ) : (
                                                                                            <input 
                                                                                                type="radio" 
                                                                                                name="mcq_correct_temp"
                                                                                                checked={tempCorrectAnswer === toLetter(idx)} 
                                                                                                onChange={() => setTempCorrectAnswer(toLetter(idx))} 
                                                                                            />
                                                                                         )}
                                                                                         <span className="text-xs text-slate-500">Correct</span>
                                                                                     </label>
                                                                                     <button onClick={() => {
                                                                                         const newOpts = [...tempMcqOptions];
                                                                                         newOpts.splice(idx, 1);
                                                                                         setTempMcqOptions(newOpts);
                                                                                         // Simple reset if option removed was part of answer
                                                                                         if(tempCorrectAnswer?.includes(toLetter(idx))) setTempCorrectAnswer(null);
                                                                                     }} className="text-slate-400 hover:text-red-500"><X size={14}/></button>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    </>
                                                                ) : group.type === 'FILL_IN_BLANKS' ? (
                                                                    <>
                                                                        <textarea 
                                                                            className="w-full p-2 border rounded text-sm bg-white text-slate-900" 
                                                                            placeholder="Example: The [sun] rises in the east."
                                                                            rows={3}
                                                                            value={tempQuestionText} 
                                                                            onChange={e => setTempQuestionText(e.target.value)} 
                                                                        />
                                                                        <p className="text-xs text-slate-500">Wrap the answer key in square brackets [ ] to indicate the blank.</p>
                                                                    </>
                                                                ) : (
                                                                    // For True/False, Matching
                                                                    <>
                                                                        <input 
                                                                            className="w-full p-2 border rounded text-sm bg-white text-slate-900" 
                                                                            placeholder={group.type === 'TRUE_FALSE_NG' ? "Statement text..." : group.type === 'YES_NO_NG' ? "Claim text..." : group.type === 'MATCHING_HEADINGS' ? "Paragraph Identifier (e.g. Paragraph A)" : group.type === 'MATCHING_FEATURES' ? "Feature/Statement to match..." : group.type === 'MATCHING_INFORMATION' ? "Statement/Information to find..." : group.type === 'MATCHING_SENTENCE_ENDINGS' ? "Sentence start..." : "Question text..."} 
                                                                            value={tempQuestionText} 
                                                                            onChange={e => setTempQuestionText(e.target.value)} 
                                                                        />
                                                                        
                                                                        {group.type === 'TRUE_FALSE_NG' && (
                                                                            <select className="w-full p-2 border rounded text-sm bg-white text-slate-900" value={tempCorrectAnswer || ''} onChange={e => setTempCorrectAnswer(e.target.value)}>
                                                                                <option value="">Select Correct Answer</option>
                                                                                <option value="TRUE">TRUE</option>
                                                                                <option value="FALSE">FALSE</option>
                                                                                <option value="NOT GIVEN">NOT GIVEN</option>
                                                                            </select>
                                                                        )}

                                                                        {group.type === 'YES_NO_NG' && (
                                                                            <select className="w-full p-2 border rounded text-sm bg-white text-slate-900" value={tempCorrectAnswer || ''} onChange={e => setTempCorrectAnswer(e.target.value)}>
                                                                                <option value="">Select Correct Answer</option>
                                                                                <option value="YES">YES</option>
                                                                                <option value="NO">NO</option>
                                                                                <option value="NOT GIVEN">NOT GIVEN</option>
                                                                            </select>
                                                                        )}

                                                                        {group.type === 'MATCHING_HEADINGS' && (
                                                                            <select className="w-full p-2 border rounded text-sm bg-white text-slate-900" value={tempCorrectAnswer || ''} onChange={e => setTempCorrectAnswer(e.target.value)}>
                                                                                <option value="">Select Correct Heading</option>
                                                                                {group.headingList?.map((_, i) => (
                                                                                    <option key={i} value={toRoman(i+1)}>{toRoman(i+1)}</option>
                                                                                ))}
                                                                            </select>
                                                                        )}

                                                                        {(group.type === 'MATCHING_FEATURES' || group.type === 'MATCHING_SENTENCE_ENDINGS') && (
                                                                            <select className="w-full p-2 border rounded text-sm bg-white text-slate-900" value={tempCorrectAnswer || ''} onChange={e => setTempCorrectAnswer(e.target.value)}>
                                                                                <option value="">Select Correct Option</option>
                                                                                {group.matchOptions?.map((_, i) => (
                                                                                    <option key={i} value={toLetter(i)}>{toLetter(i)}</option>
                                                                                ))}
                                                                            </select>
                                                                        )}
                                                                        
                                                                        {group.type === 'MATCHING_INFORMATION' && (
                                                                            <select className="w-full p-2 border rounded text-sm bg-white text-slate-900" value={tempCorrectAnswer || ''} onChange={e => setTempCorrectAnswer(e.target.value)}>
                                                                                <option value="">Select Correct Paragraph</option>
                                                                                {['A','B','C','D','E','F','G','H'].map(letter => (
                                                                                    <option key={letter} value={letter}>Paragraph {letter}</option>
                                                                                ))}
                                                                            </select>
                                                                        )}
                                                                    </>
                                                                )}
                                                                
                                                                <button onClick={() => handleAddQuestionToGroup(gIdx)} className="w-full py-2 bg-indigo-600 text-white rounded text-sm font-medium hover:bg-indigo-700">Add Question</button>
                                                                <button onClick={() => setActiveGroupIndex(null)} className="w-full py-1 text-slate-500 text-xs">Cancel</button>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <button onClick={() => setActiveGroupIndex(gIdx)} className="w-full py-2 border border-dashed rounded text-slate-500 text-sm hover:border-indigo-400 hover:text-indigo-600">+ Add Question</button>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
                
                {/* 4. WRITING MODULE SPECIFIC FIELDS */}
                {newAssignment.type === AssignmentType.WRITING && (
                    <div className="space-y-6">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">Task Type</label>
                                <select 
                                    className="w-full p-2 border rounded bg-white text-slate-900"
                                    value={newAssignment.writingTaskType}
                                    onChange={e => {
                                        const newVal = e.target.value as any;
                                        setNewAssignment({
                                            ...newAssignment, 
                                            writingTaskType: newVal,
                                            timeLimit: newVal === 'TASK_1' ? 20 : 40
                                        });
                                    }}
                                >
                                    <option value="TASK_1">Task 1 (Report/Graph)</option>
                                    <option value="TASK_2">Task 2 (Essay)</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">Time Limit (Minutes)</label>
                                <div className="flex items-center gap-2">
                                    <button 
                                        className="p-2 bg-slate-100 hover:bg-slate-200 rounded text-slate-600"
                                        onClick={() => setNewAssignment(prev => ({...prev, timeLimit: Math.max(10, (prev.timeLimit || 20) - 10)}))}
                                    >
                                        <Minus size={16} />
                                    </button>
                                    <div className="flex-1 p-2 border rounded bg-white text-slate-900 text-center font-bold">
                                        {newAssignment.timeLimit || 20} mins
                                    </div>
                                    <button 
                                        className="p-2 bg-slate-100 hover:bg-slate-200 rounded text-slate-600"
                                        onClick={() => setNewAssignment(prev => ({...prev, timeLimit: (prev.timeLimit || 20) + 10}))}
                                    >
                                        <Plus size={16} />
                                    </button>
                                </div>
                            </div>
                        </div>
                        
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-1">Essay Prompt</label>
                            <textarea 
                                className="w-full p-3 border rounded bg-white text-slate-900 h-32"
                                placeholder="Enter the essay question/prompt here..."
                                value={newAssignment.writingPrompt || ''}
                                onChange={e => setNewAssignment({...newAssignment, writingPrompt: e.target.value})}
                            />
                        </div>

                        {newAssignment.writingTaskType === 'TASK_1' && (
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">Chart/Graph Image</label>
                                <div className="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center hover:bg-slate-50 transition-colors cursor-pointer relative">
                                    <input 
                                        type="file" 
                                        accept="image/png, image/jpeg" 
                                        className="absolute inset-0 opacity-0 cursor-pointer"
                                        onChange={handleImageUpload}
                                    />
                                    {newAssignment.writingImage ? (
                                        <div className="flex flex-col items-center">
                                            <img src={`data:image/png;base64,${newAssignment.writingImage}`} alt="Task 1 Chart" className="max-h-48 rounded shadow-sm mb-2" />
                                            <span className="text-xs text-green-600 font-bold">Image Uploaded (Click to change)</span>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center text-slate-400">
                                            <ImageIcon size={32} className="mb-2" />
                                            <span className="text-sm font-medium">Click to upload Chart/Graph (PNG/JPG)</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* OTHER MODULES (Placeholder for now) */}
                {newAssignment.type !== AssignmentType.READING && newAssignment.type !== AssignmentType.WRITING && (
                    <div className="p-10 text-center bg-slate-50 rounded-xl">
                        <p className="text-slate-500">Builder for {newAssignment.type} coming in next update. Use "Instructions" above for now.</p>
                    </div>
                )}
             </div>

             <div className="p-6 border-t bg-slate-50 flex justify-between items-center sticky bottom-0 z-10">
               <button 
                  onClick={() => {
                    if(confirm('Discard changes?')) {
                      setShowAssignmentModal(false);
                      setEditingAssignmentId(null);
                    }
                  }} 
                  className="text-red-500 hover:text-red-700 text-sm font-medium flex items-center gap-2 px-2"
                >
                  <Trash2 size={16} /> Discard
                </button>
               <div className="flex gap-3">
                  <button onClick={() => setShowAssignmentModal(false)} className="px-4 py-2 text-slate-600 hover:text-slate-900">Cancel</button>
                  <button onClick={handleSaveAssignment} className="px-6 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 font-bold shadow-lg shadow-indigo-200">
                     {editingAssignmentId ? 'Update Assignment' : 'Create Assignment'}
                  </button>
               </div>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};