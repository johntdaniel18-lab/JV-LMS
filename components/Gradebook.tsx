import React, { useState, useMemo } from 'react';
import { User, Assignment, Submission, Question } from '../types';
import { BarChart2, X, AlertCircle, CheckCircle, Clock, ChevronDown, User as UserIcon } from 'lucide-react';

interface GradebookProps {
  classId: string;
  students: User[];
  assignments: Assignment[];
  submissions: Submission[];
}

export const Gradebook: React.FC<GradebookProps> = ({ classId, students, assignments, submissions }) => {
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(null);

  // Filter assignments for this class and sort by due date (desc)
  const classAssignments = useMemo(() => {
    return assignments
      .filter(a => a.classId === classId)
      .sort((a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime());
  }, [assignments, classId]);

  // Create a lookup map: submissions[studentId][assignmentId] -> Submission
  const submissionMap = useMemo(() => {
    const map: Record<string, Record<string, Submission>> = {};
    submissions.forEach(sub => {
      if (!map[sub.studentId]) map[sub.studentId] = {};
      map[sub.studentId][sub.assignmentId] = sub;
    });
    return map;
  }, [submissions]);

  // Calculate Class Average per assignment
  const assignmentAverages = useMemo(() => {
    const avgs: Record<string, string> = {};
    classAssignments.forEach(a => {
      const subs = submissions.filter(s => s.assignmentId === a.id && s.grade);
      if (subs.length === 0) {
        avgs[a.id] = '-';
        return;
      }
      
      let total = 0;
      let count = 0;
      
      subs.forEach(s => {
        // Parse grade "8/10" -> 0.8
        if (s.grade && s.grade.includes('/')) {
            const [score, max] = s.grade.split('/').map(Number);
            if (!isNaN(score) && !isNaN(max) && max > 0) {
                total += (score / max);
                count++;
            }
        }
      });

      if (count > 0) {
          avgs[a.id] = Math.round((total / count) * 100) + '%';
      } else {
          avgs[a.id] = '-';
      }
    });
    return avgs;
  }, [classAssignments, submissions]);

  // --- ANALYTICS DATA CALCULATION ---
  const analyticsData = useMemo(() => {
    if (!selectedAssignmentId) return null;
    const assignment = assignments.find(a => a.id === selectedAssignmentId);
    if (!assignment) return null;

    const assignmentSubmissions = submissions.filter(s => s.assignmentId === selectedAssignmentId);
    const gradedSubmissions = assignmentSubmissions.filter(s => s.status === 'GRADED' && s.report);

    // Flatten all questions from the assignment structure
    const allQuestions = assignment.questionGroups 
        ? assignment.questionGroups.flatMap(g => g.questions)
        : assignment.questions || [];

    // Calculate stats per question
    const questionStats = allQuestions.map(q => {
        let correctCount = 0;
        let attemptCount = 0;
        
        gradedSubmissions.forEach(sub => {
            if (sub.report && sub.report[q.id]) {
                attemptCount++;
                if (sub.report[q.id].isCorrect) correctCount++;
            }
        });

        // Avoid division by zero
        const accuracy = attemptCount > 0 ? Math.round((correctCount / attemptCount) * 100) : 0;
        return { question: q, accuracy, correctCount, attemptCount };
    }).sort((a, b) => a.accuracy - b.accuracy); // Sort by hardest first (lowest accuracy)

    // Calculate Score Distribution
    const scores = gradedSubmissions.map(s => {
        if (!s.grade) return 0;
        const [score, max] = s.grade.split('/').map(Number);
        return !isNaN(score) && !isNaN(max) && max > 0 ? (score/max) * 100 : 0;
    });
    
    const averageScore = scores.length > 0 ? Math.round(scores.reduce((a,b)=>a+b,0) / scores.length) : 0;
    const completionRate = students.length > 0 ? Math.round((assignmentSubmissions.length / students.length) * 100) : 0;

    return {
        assignment,
        assignmentSubmissions,
        gradedSubmissions,
        questionStats,
        averageScore,
        completionRate,
        allQuestions
    };
  }, [selectedAssignmentId, assignments, submissions, students.length]);

  const getStatus = (studentId: string, assignment: Assignment) => {
    const sub = submissionMap[studentId]?.[assignment.id];
    const isOverdue = new Date(assignment.dueDate) < new Date();

    if (sub) {
      if (sub.status === 'GRADED') {
        return { type: 'GRADED', label: sub.grade || 'Graded', color: 'text-slate-900 font-bold' };
      }
      return { type: 'SUBMITTED', label: 'Turned In', color: 'text-green-600 font-medium' };
    }

    if (isOverdue) {
      return { type: 'MISSING', label: 'Missing', color: 'text-red-500 font-medium' };
    }

    return { type: 'ASSIGNED', label: '-', color: 'text-slate-300' };
  };

  // --- RENDERERS ---
  const renderAnalyticsModal = () => {
    if (!analyticsData) return null;
    const { assignment, gradedSubmissions, questionStats, averageScore, completionRate, allQuestions } = analyticsData;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[70] animate-in fade-in">
            <div className="bg-white rounded-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
                <div className="p-6 border-b flex justify-between items-center bg-slate-50">
                    <div>
                        <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                             <BarChart2 className="text-indigo-600" /> 
                             Analytics: {assignment.title}
                        </h3>
                        <p className="text-sm text-slate-500 mt-1">
                            {gradedSubmissions.length} Graded / {students.length} Students
                        </p>
                    </div>
                    <button onClick={() => setSelectedAssignmentId(null)} className="p-2 hover:bg-slate-200 rounded-full">
                        <X size={20} className="text-slate-500"/>
                    </button>
                </div>

                <div className="p-6 overflow-y-auto space-y-8">
                    {/* Summary Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 text-center">
                            <p className="text-xs font-bold text-blue-600 uppercase mb-1">Average Score</p>
                            <p className="text-3xl font-bold text-slate-900">{averageScore}%</p>
                        </div>
                        <div className="bg-green-50 p-4 rounded-xl border border-green-100 text-center">
                            <p className="text-xs font-bold text-green-600 uppercase mb-1">Completion Rate</p>
                            <p className="text-3xl font-bold text-slate-900">
                                {completionRate}%
                            </p>
                        </div>
                         <div className="bg-orange-50 p-4 rounded-xl border border-orange-100 text-center">
                            <p className="text-xs font-bold text-orange-600 uppercase mb-1">Hardest Question</p>
                            <p className="text-lg font-bold text-slate-900 truncate px-2">
                                {questionStats[0]?.accuracy}% Correct
                            </p>
                            <p className="text-xs text-slate-500">Q{allQuestions.indexOf(questionStats[0]?.question) + 1}</p>
                        </div>
                    </div>

                    {/* Trouble Spots / Question Analysis */}
                    <div>
                        <h4 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                            <AlertCircle size={18} className="text-red-500"/> 
                            Question Performance (Trouble Spots)
                        </h4>
                        
                        {questionStats.length > 0 ? (
                            <div className="border rounded-xl overflow-hidden">
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-slate-50 border-b">
                                        <tr>
                                            <th className="px-4 py-3 font-semibold text-slate-600 w-16 text-center">#</th>
                                            <th className="px-4 py-3 font-semibold text-slate-600">Question Text</th>
                                            <th className="px-4 py-3 font-semibold text-slate-600 w-32">Type</th>
                                            <th className="px-4 py-3 font-semibold text-slate-600 w-32 text-right">Accuracy</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {questionStats.map((stat, idx) => {
                                            const originalIndex = allQuestions.findIndex(q => q.id === stat.question.id) + 1;
                                            // Safely access properties to prevent undefined errors
                                            const safeText = stat.question.text || '';
                                            const safeType = stat.question.type || '';
                                            
                                            return (
                                                <tr key={stat.question.id} className="hover:bg-slate-50">
                                                    <td className="px-4 py-3 text-center font-bold text-slate-500">{originalIndex}</td>
                                                    <td className="px-4 py-3 text-slate-700 font-medium">
                                                        <div className="line-clamp-2" title={safeText}>
                                                            {safeText.replace(/\[.*?\]/g, '___')}
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3 text-xs text-slate-500">
                                                        {safeType.replace(/_/g, ' ')}
                                                    </td>
                                                    <td className="px-4 py-3 text-right">
                                                        <div className="flex items-center justify-end gap-2">
                                                            <div className="w-20 h-2 bg-slate-100 rounded-full overflow-hidden">
                                                                <div 
                                                                    className={`h-full rounded-full ${stat.accuracy < 50 ? 'bg-red-500' : stat.accuracy < 80 ? 'bg-yellow-500' : 'bg-green-500'}`} 
                                                                    style={{ width: `${stat.accuracy}%` }}
                                                                />
                                                            </div>
                                                            <span className={`font-bold ${stat.accuracy < 50 ? 'text-red-600' : 'text-slate-700'}`}>
                                                                {stat.accuracy}%
                                                            </span>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <p className="text-slate-500 italic text-center py-4">No graded questions to analyze.</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Header Info */}
      <div className="flex justify-between items-center mb-4">
         <h3 className="font-bold text-lg text-slate-800">Class Gradebook</h3>
         <div className="text-sm text-slate-500 flex gap-4">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-900"></span> Graded</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500"></span> Turned In</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500"></span> Missing</span>
         </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden overflow-x-auto relative min-h-[400px]">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="sticky left-0 z-20 bg-slate-50 px-6 py-4 font-bold text-slate-700 w-64 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">Student</th>
              {classAssignments.map(a => (
                <th 
                    key={a.id} 
                    className="px-4 py-4 min-w-[140px] font-bold text-slate-700 border-l border-slate-100 group cursor-pointer hover:bg-indigo-50 transition-colors"
                    onClick={() => setSelectedAssignmentId(a.id)}
                    title="Click for Analytics"
                >
                    <div className="flex items-center justify-between gap-2">
                        <div className="truncate max-w-[120px]">{a.title}</div>
                        <BarChart2 size={14} className="text-indigo-400 opacity-0 group-hover:opacity-100" />
                    </div>
                    <div className="text-[10px] text-slate-400 font-normal mt-1">
                        Due {new Date(a.dueDate).toLocaleDateString()}
                    </div>
                </th>
              ))}
            </tr>
            {/* Class Average Row */}
            <tr className="bg-slate-50/50 border-b border-slate-200">
                <td className="sticky left-0 z-20 bg-slate-50/90 px-6 py-3 font-bold text-slate-500 text-xs uppercase tracking-wider shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                    Class Average
                </td>
                {classAssignments.map(a => (
                    <td key={a.id} className="px-4 py-3 text-center border-l border-slate-100 text-xs font-bold text-slate-600">
                        {assignmentAverages[a.id]}
                    </td>
                ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {students.length === 0 && (
                <tr><td colSpan={classAssignments.length + 1} className="p-8 text-center text-slate-500 italic">No students enrolled yet.</td></tr>
            )}
            {students.map(student => (
              <tr key={student.id} className="hover:bg-slate-50">
                <td className="sticky left-0 z-10 bg-white group-hover:bg-slate-50 px-6 py-4 font-medium text-slate-900 border-r border-slate-100 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs font-bold">
                            {student.name.charAt(0)}
                        </div>
                        {student.name}
                    </div>
                </td>
                {classAssignments.map(a => {
                  const status = getStatus(student.id, a);
                  return (
                    <td key={a.id} className="px-4 py-4 text-center border-l border-slate-100 relative">
                        <div className={`text-sm ${status.color}`}>
                            {status.label}
                        </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      {renderAnalyticsModal()}
    </div>
  );
};