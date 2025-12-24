
import React, { useState, useEffect, useRef } from 'react';
import { User, Assignment, Submission, ClassGroup, Session, Material, CalendarEvent, AssignmentType, AssignmentGroup, QuestionGroup, Question, SubmissionReport, QuestionResult, SubmissionMetadata } from '../types';
import { PlayCircle, FileText, Mic, CheckCircle, Clock, ChevronRight, Loader2, AlertCircle, Calendar as CalendarIcon, BookOpen, Link as LinkIcon, Play, LogOut, School, Layout, Image as ImageIcon, ZoomIn, X, Timer, StickyNote, Headphones, Folder, ArrowLeft, CheckSquare, Square, FileCheck, PenTool } from 'lucide-react';
import { AudioRecorder } from './AudioRecorder';
import { transcribeAudio } from '../services/geminiService';
import { Calendar } from './Calendar';
import { AssignmentViewer } from './AssignmentViewer';

interface StudentPortalProps {
  user: User;
  classes: ClassGroup[];
  sessions: Session[];
  materials: Material[];
  assignments: Assignment[];
  assignmentGroups: AssignmentGroup[];
  submissions: Submission[];
  events: CalendarEvent[];
  onSubmit: (submission: Submission) => void;
  onLogout: () => void;
}

export const StudentPortal: React.FC<StudentPortalProps> = ({ 
  user, classes, sessions, materials, assignments, assignmentGroups, submissions, events, onSubmit, onLogout 
}) => {
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [viewingGroupId, setViewingGroupId] = useState<string | null>(null);
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'schedule' | 'sessions' | 'assignments'>('overview');
  
  // Assignment Taking State
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [transcriptions, setTranscriptions] = useState<Record<string, string>>({});
  const [isTranscribing, setIsTranscribing] = useState(false);
  
  // UI State
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  
  // Report State
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportSubmission, setReportSubmission] = useState<Submission | null>(null);

  // Speaking Timer State
  const [timer, setTimer] = useState(0);
  const [timerMode, setTimerMode] = useState<'PREP' | 'RECORDING' | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [notes, setNotes] = useState('');

  // Filter Data
  const enrolledClasses = classes.filter(c => user.enrolledClassIds?.includes(c.id));
  const selectedClass = classes.find(c => c.id === selectedClassId);
  const classAssignments = assignments.filter(a => a.classId === selectedClassId);
  const classGroups = assignmentGroups.filter(g => g.classId === selectedClassId);
  const classSessions = sessions.filter(s => s.classId === selectedClassId);
  const classEvents = events.filter(e => e.classId === selectedClassId);

  const getSubmission = (assignmentId: string) => submissions.find(s => s.assignmentId === assignmentId);

  // Timer Effect
  useEffect(() => {
    let interval: any;
    if (timer > 0) {
      interval = setInterval(() => setTimer(t => t - 1), 1000);
    } else if (timer === 0 && timerMode === 'PREP') {
      // Prep finished
      setTimerMode(null);
    }
    return () => clearInterval(interval);
  }, [timer, timerMode]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const startSpeakingPrep = () => {
    setTimer(60); // 1 minute prep
    setTimerMode('PREP');
    setShowNotes(true);
  };

  const startSpeakingTimer = () => {
    setTimer(120); // 2 minutes speaking
    setTimerMode('RECORDING');
  };

  const handleSubmit = async (metadata?: SubmissionMetadata) => {
    if (!selectedAssignment) return;
    
    // Basic Submission Object
    const submissionId = Math.random().toString(36).substr(2, 9);
    let status: 'SUBMITTED' | 'GRADED' = 'SUBMITTED';
    let grade: string | undefined = undefined;
    let report: SubmissionReport | undefined = undefined;

    // AUTO-GRADING LOGIC for Reading & Listening
    if (selectedAssignment.type === AssignmentType.READING || selectedAssignment.type === AssignmentType.LISTENING) {
        status = 'GRADED';
        report = {};
        let correctCount = 0;
        let totalQuestions = 0;

        // Flatten all questions
        const allQuestions = selectedAssignment.questionGroups 
            ? selectedAssignment.questionGroups.flatMap(g => g.questions)
            : selectedAssignment.questions || [];

        totalQuestions = allQuestions.length;

        allQuestions.forEach(q => {
            const studentAns = (answers[q.id] || "").trim();
            const correctAns = (q.correctAnswer || "").trim();
            let isCorrect = false;

            if (q.type === 'MCQ' && (q.maxSelection || 1) > 1) {
                // Multi-select MCQ: Sort both comma-separated lists and compare
                const sSorted = studentAns.split(',').map(s => s.trim()).sort().join(',');
                const cSorted = correctAns.split(',').map(s => s.trim()).sort().join(',');
                isCorrect = sSorted === cSorted;
            } else if (q.type === 'FILL_IN_BLANKS' || q.type === 'NOTES_COMPLETION') {
                // Text-based: Case-insensitive comparison
                isCorrect = studentAns.toLowerCase() === correctAns.toLowerCase();
            } else {
                // Standard: Exact Match
                isCorrect = studentAns === correctAns;
            }

            if (isCorrect) correctCount++;

            report![q.id] = {
                questionId: q.id,
                isCorrect,
                studentAnswer: studentAns,
                correctAnswer: correctAns
            };
        });

        grade = `${correctCount}/${totalQuestions}`;
    }

    const transcriptionText = Object.values(transcriptions).join('\n\n---\n\n');
    
    const submission: Submission = {
      id: submissionId,
      assignmentId: selectedAssignment.id,
      studentId: user.id,
      studentName: user.name,
      answers: answers,
      status: status,
      grade: grade,
      report: report,
      transcription: transcriptionText || undefined,
      metadata: metadata // Integrity data
    };
    
    onSubmit(submission);

    // Show Report Immediately if Graded
    if (status === 'GRADED') {
        setReportSubmission(submission);
        setShowReportModal(true);
    }

    setSelectedAssignment(null);
    setAnswers({});
    setTranscriptions({});
    setTimer(0);
    setTimerMode(null);
    setShowNotes(false);
  };

  const handleSpeakingRecording = async (questionId: string, base64Audio: string, mimeType: string) => {
    setAnswers(prev => ({ ...prev, [questionId]: `data:${mimeType};base64,${base64Audio}` }));
    setIsTranscribing(true);
    try {
      const text = await transcribeAudio(base64Audio, mimeType);
      setTranscriptions(prev => ({ ...prev, [questionId]: text }));
    } catch (e) { console.error(e); } finally { setIsTranscribing(false); }
  };

  // --- Views ---

  // 1. Assignment Taking View (Full Screen)
  if (selectedAssignment) {
    return (
        <AssignmentViewer 
            assignment={selectedAssignment}
            answers={answers}
            onAnswerChange={(id, val) => setAnswers(prev => ({...prev, [id]: val}))}
            onSubmit={handleSubmit}
            onExit={() => setSelectedAssignment(null)}
            isSubmitting={isTranscribing}
        />
    );
  }
  
  // REPORT MODAL
  if (showReportModal && reportSubmission) {
      // Logic to get Ordered Questions for Report
      const assignment = assignments.find(a => a.id === reportSubmission.assignmentId);
      let orderedReportItems: QuestionResult[] = [];
      
      if (assignment) {
          const allQuestions = assignment.questionGroups 
            ? assignment.questionGroups.flatMap(g => g.questions)
            : assignment.questions || [];
            
          orderedReportItems = allQuestions.map(q => {
              if (reportSubmission.report && reportSubmission.report[q.id]) {
                  return reportSubmission.report[q.id];
              }
              return {
                  questionId: q.id,
                  isCorrect: false,
                  studentAnswer: '',
                  correctAnswer: q.correctAnswer || ''
              };
          });
      }

      return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 animate-in fade-in">
              <div className="bg-white rounded-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
                  <div className="p-6 border-b flex justify-between items-center bg-slate-50">
                      <div>
                          <h3 className="text-xl font-bold text-slate-900">Assignment Report</h3>
                          <p className="text-sm text-slate-500">
                              Assignment: {assignment?.title}
                          </p>
                      </div>
                      <button onClick={() => { setShowReportModal(false); setReportSubmission(null); }} className="p-2 hover:bg-slate-200 rounded-full">
                          <X size={20} className="text-slate-500"/>
                      </button>
                  </div>
                  
                  <div className="p-6 overflow-y-auto">
                      <div className="flex items-center gap-4 mb-6">
                           <div className="bg-indigo-50 text-indigo-700 px-4 py-3 rounded-lg flex items-center gap-3 border border-indigo-100">
                               <CheckCircle size={24} />
                               <div>
                                   <p className="text-xs font-bold uppercase tracking-wider opacity-70">Total Score</p>
                                   <p className="text-2xl font-bold">{reportSubmission.grade}</p>
                               </div>
                           </div>
                      </div>

                      {orderedReportItems.length > 0 ? (
                          <div className="border border-slate-200 rounded-lg overflow-hidden">
                              <table className="w-full text-left text-sm">
                                  <thead className="bg-slate-50 border-b border-slate-200">
                                      <tr>
                                          <th className="px-4 py-3 font-bold text-slate-600 w-16 text-center">#</th>
                                          <th className="px-4 py-3 font-bold text-slate-600 w-24 text-center">Status</th>
                                          <th className="px-4 py-3 font-bold text-slate-600">Your Answer</th>
                                          <th className="px-4 py-3 font-bold text-slate-600">Correct Answer</th>
                                      </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100">
                                      {orderedReportItems.map((res: QuestionResult, idx: number) => (
                                          <tr key={res.questionId} className={res.isCorrect ? 'bg-green-50/30' : 'bg-red-50/30'}>
                                              <td className="px-4 py-3 text-center font-bold text-slate-500">{idx + 1}</td>
                                              <td className="px-4 py-3 text-center">
                                                  {res.isCorrect ? (
                                                      <span className="inline-flex items-center justify-center w-6 h-6 bg-green-100 text-green-700 rounded-full">
                                                          <CheckCircle size={14} />
                                                      </span>
                                                  ) : (
                                                      <span className="inline-flex items-center justify-center w-6 h-6 bg-red-100 text-red-700 rounded-full">
                                                          <X size={14} />
                                                      </span>
                                                  )}
                                              </td>
                                              <td className={`px-4 py-3 font-medium ${res.isCorrect ? 'text-green-700' : 'text-red-700'}`}>
                                                  {res.studentAnswer || <span className="text-slate-400 italic">No Answer</span>}
                                              </td>
                                              <td className="px-4 py-3 text-slate-700">
                                                  {res.correctAnswer}
                                              </td>
                                          </tr>
                                      ))}
                                  </tbody>
                              </table>
                          </div>
                      ) : (
                          <p className="text-center text-slate-500">No detailed report available.</p>
                      )}
                  </div>
              </div>
          </div>
      );
  }

  // 2. Class Detail View
  if (selectedClass) {
    const activeAssignments = classAssignments
        .filter(a => !getSubmission(a.id)) // Filter incomplete assignments
        .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()); // Sort by due date (ascending)

    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <header className="bg-white shadow-sm px-6 py-4 flex justify-between items-center sticky top-0 z-10">
          <div className="flex items-center gap-4">
             <button onClick={() => setSelectedClassId(null)} className="p-2 hover:bg-slate-100 rounded-full text-slate-500"><ChevronRight className="rotate-180" /></button>
             <div>
               <h1 className="text-xl font-bold text-slate-900">{selectedClass.name}</h1>
               <p className="text-xs text-slate-500">{selectedClass.schedule}</p>
             </div>
          </div>
          <button onClick={onLogout} className="text-sm font-medium text-slate-600">Logout</button>
        </header>

        <main className="flex-1 max-w-5xl mx-auto w-full p-6 space-y-8">
           {/* Tabs */}
           <div className="flex space-x-1 mb-6 border-b border-slate-200 overflow-x-auto">
             {['overview', 'schedule', 'sessions', 'assignments'].map((tab) => (
               <button
                 key={tab}
                 onClick={() => setActiveTab(tab as any)}
                 className={`px-4 py-3 text-sm font-medium capitalize transition-colors border-b-2 whitespace-nowrap ${
                   activeTab === tab ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'
                 }`}
               >
                 {tab}
               </button>
             ))}
           </div>

           {/* Section: Overview */}
           {activeTab === 'overview' && (
             <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
               <div className="md:col-span-2 space-y-6">
                 <section className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                   <h2 className="text-lg font-bold text-slate-800 mb-2">Class Overview</h2>
                   <p className="text-slate-600 leading-relaxed">{selectedClass.description || "Welcome to the class! Check the sessions below for materials."}</p>
                 </section>
               </div>

               <div className="md:col-span-1">
                  <section className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 h-full flex flex-col">
                     <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2"><Clock size={20} className="text-orange-600"/> Active Assignments</h2>
                     <div className="space-y-4 flex-1">
                        {activeAssignments.length === 0 ? (
                           <div className="text-center py-8 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                              <CheckCircle className="mx-auto text-green-500 mb-2" size={24} />
                              <p className="text-sm text-slate-500">All caught up!</p>
                           </div>
                        ) : (
                           <>
                               {activeAssignments.slice(0, 3).map(assignment => (
                                  <div key={assignment.id} className="p-3 border rounded-lg hover:border-indigo-300 transition-colors bg-white">
                                     <div className="flex justify-between items-start mb-1">
                                        <span className="text-[10px] font-bold bg-slate-100 px-1.5 py-0.5 rounded text-slate-600 uppercase">{assignment.type}</span>
                                        <span className="text-[10px] text-orange-600 font-bold">{new Date(assignment.dueDate).toLocaleDateString()}</span>
                                     </div>
                                     <h4 className="text-sm font-bold text-slate-800 mb-2 truncate">{assignment.title}</h4>
                                     <button 
                                        onClick={() => setSelectedAssignment(assignment)}
                                        className="w-full py-1.5 bg-indigo-600 text-white text-xs font-bold rounded hover:bg-indigo-700 transition-colors"
                                     >
                                        Start Now
                                     </button>
                                  </div>
                               ))}
                               {activeAssignments.length > 3 && (
                                   <button 
                                        onClick={() => setActiveTab('assignments')}
                                        className="w-full text-center text-xs text-indigo-600 font-bold hover:underline mt-2"
                                   >
                                       View all {activeAssignments.length} active assignments &rarr;
                                   </button>
                               )}
                           </>
                        )}
                     </div>
                  </section>
               </div>
             </div>
           )}

           {activeTab === 'schedule' && (
             <section>
               <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2"><CalendarIcon size={20} className="text-indigo-600"/> Class Schedule</h2>
               <Calendar events={classEvents} readOnly={true} />
             </section>
           )}

           {/* Section: Assignments */}
           {activeTab === 'assignments' && (
             <section>
                <div className="flex items-center gap-2 mb-4">
                    {viewingGroupId && (
                        <button onClick={() => setViewingGroupId(null)} className="p-1 hover:bg-slate-100 rounded-full">
                            <ArrowLeft size={16} />
                        </button>
                    )}
                    <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        <Clock size={20} className="text-indigo-600"/> 
                        {viewingGroupId ? classGroups.find(g => g.id === viewingGroupId)?.title : 'Assignments'}
                    </h2>
                </div>

               {!viewingGroupId ? (
                   // FOLDER LIST & LOOSE ASSIGNMENTS
                   <div className="grid gap-4 md:grid-cols-2">
                        {/* Folders */}
                        {classGroups.map(group => (
                            <div key={group.id} onClick={() => setViewingGroupId(group.id)} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm cursor-pointer hover:border-indigo-400 hover:shadow-md transition-all">
                                <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center">
                                        <Folder size={24} fill="currentColor" fillOpacity={0.2} />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-slate-900">{group.title}</h3>
                                        <p className="text-xs text-slate-500">{classAssignments.filter(a => a.groupId === group.id).length} Tasks</p>
                                    </div>
                                    <ChevronRight className="ml-auto text-slate-300" />
                                </div>
                            </div>
                        ))}
                        
                        {/* Loose Assignments (No Folder) */}
                        {classAssignments.filter(a => !a.groupId).map(assignment => {
                           const submission = getSubmission(assignment.id);
                           const isCompleted = submission?.status === 'GRADED' || submission?.status === 'SUBMITTED';
                           
                           return (
                             <div key={assignment.id} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col">
                                <div className="flex justify-between items-start mb-2">
                                   <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded uppercase tracking-wider">{assignment.type}</span>
                                   {isCompleted ? (
                                     <span className="text-green-600 text-xs font-bold flex items-center gap-1"><CheckCircle size={12}/> {submission.status}</span>
                                   ) : (
                                     <span className="text-orange-600 text-xs font-bold">Due {new Date(assignment.dueDate).toLocaleDateString()}</span>
                                   )}
                                </div>
                                <h3 className="font-bold text-slate-900 mb-1">{assignment.title}</h3>
                                <p className="text-sm text-slate-500 line-clamp-2 mb-4">{assignment.description}</p>
                                
                                <div className="mt-auto pt-4 border-t border-slate-100">
                                  {isCompleted ? (
                                     <div className="text-sm">
                                       <div className="flex justify-between items-center font-medium text-slate-700">
                                         <span className="flex items-center gap-1">Score: <span className="text-indigo-600 font-bold">{submission.grade || 'Pending'}</span></span>
                                         <button 
                                            onClick={() => { setReportSubmission(submission); setShowReportModal(true); }}
                                            className="text-indigo-600 text-xs font-bold flex items-center gap-1 hover:underline"
                                         >
                                            <FileCheck size={14} /> View Report
                                         </button>
                                       </div>
                                     </div>
                                  ) : (
                                    <button 
                                      onClick={() => setSelectedAssignment(assignment)}
                                      className="w-full py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
                                    >
                                      Start Assignment
                                    </button>
                                  )}
                                </div>
                             </div>
                           );
                        })}

                        {classGroups.length === 0 && classAssignments.filter(a => !a.groupId).length === 0 && (
                            <p className="text-slate-500 italic col-span-2 text-center py-8">No assignments yet.</p>
                        )}
                   </div>
               ) : (
                   // ASSIGNMENT LIST (INSIDE FOLDER)
                   <div className="grid gap-4 md:grid-cols-2">
                     {classAssignments.filter(a => a.groupId === viewingGroupId).map(assignment => {
                       const submission = getSubmission(assignment.id);
                       const isCompleted = submission?.status === 'GRADED' || submission?.status === 'SUBMITTED';
                       
                       return (
                         <div key={assignment.id} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col">
                            <div className="flex justify-between items-start mb-2">
                               <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded uppercase tracking-wider">{assignment.type}</span>
                               {isCompleted ? (
                                 <span className="text-green-600 text-xs font-bold flex items-center gap-1"><CheckCircle size={12}/> {submission.status}</span>
                               ) : (
                                 <span className="text-orange-600 text-xs font-bold">Due {new Date(assignment.dueDate).toLocaleDateString()}</span>
                               )}
                            </div>
                            <h3 className="font-bold text-slate-900 mb-1">{assignment.title}</h3>
                            <p className="text-sm text-slate-500 line-clamp-2 mb-4">{assignment.description}</p>
                            
                            <div className="mt-auto pt-4 border-t border-slate-100">
                              {isCompleted ? (
                                 <div className="text-sm">
                                   <div className="flex justify-between items-center font-medium text-slate-700">
                                     <span className="flex items-center gap-1">Score: <span className="text-indigo-600 font-bold">{submission.grade || 'Pending'}</span></span>
                                     <button 
                                        onClick={() => { setReportSubmission(submission); setShowReportModal(true); }}
                                        className="text-indigo-600 text-xs font-bold flex items-center gap-1 hover:underline"
                                     >
                                        <FileCheck size={14} /> View Report
                                     </button>
                                   </div>
                                 </div>
                              ) : (
                                <button 
                                  onClick={() => setSelectedAssignment(assignment)}
                                  className="w-full py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
                                >
                                  Start Assignment
                                </button>
                              )}
                            </div>
                         </div>
                       );
                     })}
                     {classAssignments.filter(a => a.groupId === viewingGroupId).length === 0 && <p className="text-slate-500 italic">No tasks in this folder.</p>}
                   </div>
               )}
             </section>
           )}
        </main>
      </div>
    );
  }

  // 3. Dashboard (Class List)
  return (
    <div className="min-h-screen bg-slate-50 p-6 flex flex-col">
       <div className="max-w-5xl mx-auto w-full flex-1">
         <header className="flex justify-between items-center mb-10 py-4">
           <div>
             <h1 className="text-2xl font-bold text-slate-900">Welcome, {user.name}</h1>
             <p className="text-slate-500">Here are your enrolled classes.</p>
           </div>
           <button onClick={onLogout} className="text-sm text-slate-500 hover:text-red-600 flex items-center gap-1">
             <LogOut size={16} /> Logout
           </button>
         </header>

         {enrolledClasses.length === 0 ? (
           <div className="text-center py-16 bg-white rounded-2xl border-2 border-dashed border-slate-200">
             <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-400">
               <School size={32} />
             </div>
             <h3 className="text-lg font-bold text-slate-800">No Classes Found</h3>
             <p className="text-slate-500">You haven't been enrolled in any classes yet.</p>
           </div>
         ) : (
           <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
             {enrolledClasses.map(c => (
               <div 
                 key={c.id} 
                 onClick={() => setSelectedClassId(c.id)}
                 className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-xl hover:scale-[1.02] transition-all cursor-pointer overflow-hidden group"
               >
                 <div className="h-3 bg-indigo-500"></div>
                 <div className="p-6">
                   <h3 className="text-xl font-bold text-slate-900 mb-2 group-hover:text-indigo-600 transition-colors">{c.name}</h3>
                   <div className="flex items-center gap-2 text-slate-500 text-sm mb-4">
                     <CalendarIcon size={16} /> {c.schedule}
                   </div>
                   <p className="text-sm text-slate-400 line-clamp-2">{c.description}</p>
                 </div>
                 <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-between items-center text-xs font-bold text-indigo-600 uppercase tracking-wider">
                    <span>Enter Classroom</span>
                    <ChevronRight size={16} />
                 </div>
               </div>
             ))}
           </div>
         )}
       </div>
    </div>
  );
};
