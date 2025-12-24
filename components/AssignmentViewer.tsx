
import React, { useState, useEffect, useRef } from 'react';
import { Assignment, AssignmentType, Question, QuestionGroup, SubmissionMetadata } from '../types';
import { Clock, BookOpen, Headphones, PenTool, CheckSquare, Square, ChevronRight, AlertTriangle, ShieldAlert } from 'lucide-react';

// --- Helper Functions ---
const toRoman = (num: number) => {
    const romans = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x", "xi", "xii", "xiii", "xiv", "xv"];
    return romans[num-1] || num.toString();
};

const toLetter = (num: number) => String.fromCharCode(65 + num);

const getWordCount = (text: string) => text ? text.trim().split(/\s+/).filter(w => w.length > 0).length : 0;

// --- Sub-Components ---

const NotesCompletionRenderer: React.FC<{
  content: string;
  questions: Question[];
  startGlobalIndex: number;
  answers: Record<string, string>;
  onAnswerChange: (qId: string, val: string) => void;
}> = ({ content, questions, startGlobalIndex, answers, onAnswerChange }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Build DOM on content change
  useEffect(() => {
    if (!containerRef.current) return;
    
    // Set initial HTML
    containerRef.current.innerHTML = content;
    
    // Find text nodes with brackets
    const walker = document.createTreeWalker(containerRef.current, NodeFilter.SHOW_TEXT, null);
    const nodesToReplace: { node: Node, text: string }[] = [];
    
    let node;
    while(node = walker.nextNode()) {
        if (node.nodeValue && node.nodeValue.match(/\[(.*?)\]/)) {
            nodesToReplace.push({ node: node, text: node.nodeValue });
        }
    }

    let qIndex = 0;

    nodesToReplace.forEach(({ node, text }) => {
        const fragment = document.createDocumentFragment();
        const regex = /\[(.*?)\]/g;
        let lastIndex = 0;
        let match;

        while ((match = regex.exec(text)) !== null) {
            // Text before
            if (match.index > lastIndex) {
                fragment.appendChild(document.createTextNode(text.substring(lastIndex, match.index)));
            }
            
            // Input replacement
            if (qIndex < questions.length) {
                const q = questions[qIndex];
                const globalIdx = startGlobalIndex + qIndex;
                
                // Wrapper to keep number and input together
                const wrapper = document.createElement('span');
                wrapper.className = "inline-flex items-baseline mx-1 align-baseline"; 
                wrapper.id = `question-${globalIdx}`;

                // Number
                const span = document.createElement('span');
                span.className = "text-indigo-600 font-bold text-lg mr-1 select-none";
                span.innerText = `${globalIdx + 1}`;
                
                // Input
                const input = document.createElement('input');
                input.className = "px-1 border-b-2 border-slate-300 focus:border-indigo-600 outline-none bg-indigo-50/30 text-indigo-900 text-center min-w-[80px] w-[100px] font-medium h-7 text-base transition-colors rounded-t-sm";
                input.value = answers[q.id] || '';
                input.dataset.questionId = q.id;
                input.autocomplete = "off";
                
                input.oninput = (e: any) => {
                    onAnswerChange(q.id, e.target.value);
                };

                wrapper.appendChild(span);
                wrapper.appendChild(input);
                fragment.appendChild(wrapper);

                qIndex++;
            } else {
                 fragment.appendChild(document.createTextNode(match[0]));
            }

            lastIndex = regex.lastIndex;
        }

        // Text after
        if (lastIndex < text.length) {
            fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
        }
        
        if (node.parentNode) {
            node.parentNode.replaceChild(fragment, node);
        }
    });

  }, [content, questions, startGlobalIndex]);

  // Sync answers without rebuilding DOM to preserve focus
  useEffect(() => {
     if (!containerRef.current) return;
     const inputs = containerRef.current.querySelectorAll('input');
     inputs.forEach((input: any) => {
         const qId = input.dataset.questionId;
         if (qId && answers[qId] !== undefined && input.value !== answers[qId]) {
             input.value = answers[qId];
         }
     });
  }, [answers]);

  return <div ref={containerRef} className="prose prose-slate max-w-none text-slate-800 leading-relaxed notes-content" />;
};

interface AssignmentViewerProps {
  assignment: Assignment;
  answers: Record<string, string>;
  onAnswerChange: (questionId: string, value: string) => void;
  onSubmit: (metadata?: SubmissionMetadata) => void;
  onExit: () => void;
  isSubmitting?: boolean;
  isTeacherPreview?: boolean;
}

export const AssignmentViewer: React.FC<AssignmentViewerProps> = ({ 
  assignment, answers, onAnswerChange, onSubmit, onExit, isSubmitting = false, isTeacherPreview = false 
}) => {
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [tabSwitches, setTabSwitches] = useState(0);
  const [pasteAttempts, setPasteAttempts] = useState(0);
  const [showWarning, setShowWarning] = useState<string | null>(null);

  // Initialize Timer
  useEffect(() => {
      if (assignment.timeLimit && !isTeacherPreview) {
          setTimeLeft(assignment.timeLimit * 60); // Convert mins to seconds
      }
  }, [assignment.timeLimit, isTeacherPreview]);

  // Timer Logic
  useEffect(() => {
      if (timeLeft === null || isTeacherPreview) return;
      
      if (timeLeft <= 0) {
          // Time expired
          handleSubmit();
          return;
      }

      const timerId = setInterval(() => {
          setTimeLeft(prev => (prev !== null && prev > 0) ? prev - 1 : 0);
      }, 1000);

      return () => clearInterval(timerId);
  }, [timeLeft, isTeacherPreview]);

  // Anti-Cheat: Tab Switching detection
  useEffect(() => {
      if (isTeacherPreview) return;

      const handleVisibilityChange = () => {
          if (document.visibilityState === 'hidden') {
              setTabSwitches(prev => prev + 1);
              setShowWarning("Tab switching detected! This incident will be reported.");
              setTimeout(() => setShowWarning(null), 4000);
          }
      };

      document.addEventListener('visibilitychange', handleVisibilityChange);
      return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isTeacherPreview]);

  const handlePaste = (e: React.ClipboardEvent) => {
      if (isTeacherPreview) return;
      e.preventDefault();
      setPasteAttempts(prev => prev + 1);
      setShowWarning("Copy/Paste is disabled for this exam. This attempt has been logged.");
      setTimeout(() => setShowWarning(null), 4000);
  };

  const formatTime = (seconds: number) => {
      const m = Math.floor(seconds / 60);
      const s = seconds % 60;
      return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleSubmit = () => {
      onSubmit({
          tabSwitches,
          pasteAttempts
      });
  };

  const scrollToQuestion = (globalIndex: number) => {
      const el = document.getElementById(`question-${globalIndex}`);
      if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
  };

  const renderSingleQuestion = (q: Question, idx: number, globalIndex: number, group?: QuestionGroup) => {
    const questionType = q.type || group?.type;
    
    // RENDER FOR FILL_IN_BLANKS (Sentence Completion)
    if (questionType === 'FILL_IN_BLANKS') {
        const hasBrackets = q.text.match(/\[(.*?)\]/);
        
        if (hasBrackets) {
            const parts = q.text.split(/(\[.*?\])/);
            return (
                <div key={q.id} id={`question-${globalIndex}`} className="mb-6 p-3 rounded-lg hover:bg-slate-50 transition-colors">
                    <div className="flex items-baseline gap-2">
                         <span className="text-indigo-600 font-bold text-lg min-w-[20px] text-right select-none">
                            {globalIndex + 1}
                        </span>
                        <div className="text-slate-800 font-medium leading-relaxed">
                            {parts.map((part, i) => {
                                if (part.startsWith('[') && part.endsWith(']')) {
                                    return (
                                        <input 
                                            key={i}
                                            className="mx-1 px-1 border-b-2 border-slate-300 focus:border-indigo-600 outline-none bg-transparent text-indigo-700 text-center min-w-[80px] w-[100px] font-bold"
                                            value={answers[q.id] || ''}
                                            onChange={e => onAnswerChange(q.id, e.target.value)}
                                            autoComplete="off"
                                        />
                                    );
                                }
                                return <span key={i}>{part}</span>;
                            })}
                        </div>
                    </div>
                </div>
            );
        }
        
        return (
            <div key={q.id} id={`question-${globalIndex}`} className="mb-6 p-3 rounded-lg hover:bg-slate-50 transition-colors">
                <div className="flex items-baseline gap-2 mb-2">
                    <span className="text-indigo-600 font-bold text-lg min-w-[20px] text-right select-none">
                        {globalIndex + 1}
                    </span>
                    <span className="text-slate-800 font-medium leading-relaxed whitespace-pre-wrap">{q.text}</span>
                </div>
                <div className="ml-9">
                    <input 
                        className="w-full max-w-sm p-2 border border-slate-300 rounded focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-slate-900 shadow-sm"
                        placeholder="Answer..."
                        value={answers[q.id] || ''}
                        onChange={e => onAnswerChange(q.id, e.target.value)}
                        autoComplete="off"
                    />
                </div>
            </div>
        );
    }

    const isCompact = questionType === 'MATCHING_HEADINGS' || questionType === 'MATCHING_FEATURES' || questionType === 'MATCHING_INFORMATION' || questionType === 'MATCHING_SENTENCE_ENDINGS';

    return (
        <div key={q.id} id={`question-${globalIndex}`} className={`${isCompact ? 'mb-2 p-2' : 'mb-6 p-3'} rounded-lg hover:bg-slate-50 transition-colors`}>
            <div className="flex items-baseline gap-1.5 mb-2">
                <span className="text-indigo-600 font-bold text-lg min-w-[20px] text-right select-none">
                    {globalIndex + 1}
                </span>
                <span className="text-slate-800 font-medium leading-relaxed whitespace-pre-wrap">{q.text}</span>
                
                {/* DROPDOWNS */}
                {questionType === 'MATCHING_HEADINGS' && group && (
                    <div className="ml-4 inline-block">
                        <select
                            className="p-1 px-3 border-2 border-indigo-200 rounded text-indigo-800 font-bold outline-none focus:border-indigo-500 bg-white"
                            value={answers[q.id] || ''}
                            onChange={(e) => onAnswerChange(q.id, e.target.value)}
                        >
                            <option value="" disabled>Select</option>
                            {group.headingList?.map((_, i) => (
                                <option key={i} value={toRoman(i+1)}>{toRoman(i+1)}</option>
                            ))}
                        </select>
                    </div>
                )}
                {(questionType === 'MATCHING_FEATURES' || questionType === 'MATCHING_SENTENCE_ENDINGS') && group && (
                    <div className="ml-4 inline-block">
                        <select
                            className="p-1 px-3 border-2 border-indigo-200 rounded text-indigo-800 font-bold outline-none focus:border-indigo-500 bg-white"
                            value={answers[q.id] || ''}
                            onChange={(e) => onAnswerChange(q.id, e.target.value)}
                        >
                            <option value="" disabled>Select</option>
                            {group.matchOptions?.map((_, i) => (
                                <option key={i} value={toLetter(i)}>{toLetter(i)}</option>
                            ))}
                        </select>
                    </div>
                )}
                {questionType === 'MATCHING_INFORMATION' && (
                    <div className="ml-4 inline-block">
                        <select
                            className="p-1 px-3 border-2 border-indigo-200 rounded text-indigo-800 font-bold outline-none focus:border-indigo-500 bg-white"
                            value={answers[q.id] || ''}
                            onChange={(e) => onAnswerChange(q.id, e.target.value)}
                        >
                            <option value="" disabled>Select</option>
                            {['A','B','C','D','E','F','G','H'].map((letter) => (
                                <option key={letter} value={letter}>Paragraph {letter}</option>
                            ))}
                        </select>
                    </div>
                )}
            </div>

            {/* MCQ */}
            {questionType === 'MCQ' && q.options && (
                <div className="flex flex-col gap-3 ml-8 mt-2">
                    {q.options.map((option, idx) => {
                        const letter = toLetter(idx);
                        const isMulti = (q.maxSelection || 1) > 1;
                        const isSelected = isMulti 
                            ? (answers[q.id]?.split(',') || []).includes(letter)
                            : answers[q.id] === letter;
                        
                        return (
                            <label key={idx} className={`flex items-start gap-3 cursor-pointer group p-2 rounded-lg border transition-all ${isSelected ? 'border-indigo-600 bg-indigo-50' : 'border-transparent hover:bg-slate-50'}`}>
                                <div className={`shrink-0 w-6 h-6 flex items-center justify-center rounded text-sm font-bold transition-colors ${isSelected ? 'bg-indigo-600 text-white border border-indigo-600' : 'bg-white text-slate-500 border border-slate-300 group-hover:border-indigo-300'} ${!isMulti ? 'rounded-full' : 'rounded-md'}`}>
                                    {isMulti ? (
                                        isSelected ? <CheckSquare size={16} /> : <Square size={16} />
                                    ) : (
                                        letter
                                    )}
                                </div>
                                <input 
                                    type={isMulti ? 'checkbox' : 'radio'}
                                    name={`q-${q.id}`} 
                                    value={letter} 
                                    checked={isSelected} 
                                    onChange={(e) => {
                                        if (isMulti) {
                                            const currentStr = answers[q.id] || '';
                                            const currentArr = currentStr ? currentStr.split(',') : [];
                                            let newArr;
                                            if (currentArr.includes(letter)) {
                                                newArr = currentArr.filter(l => l !== letter);
                                            } else {
                                                if (currentArr.length >= (q.maxSelection || 1)) return;
                                                newArr = [...currentArr, letter].sort();
                                            }
                                            onAnswerChange(q.id, newArr.join(','));
                                        } else {
                                            onAnswerChange(q.id, e.target.value);
                                        }
                                    }} 
                                    className="hidden"
                                />
                                <span className={`text-slate-800 leading-relaxed ${isSelected ? 'font-medium' : ''}`}>
                                    {isMulti ? (
                                        <span><span className="font-bold text-indigo-600 mr-2">{letter}</span>{option}</span>
                                    ) : option}
                                </span>
                            </label>
                        );
                    })}
                </div>
            )}

            {/* RADIOS FOR T/F/NG & Y/N/NG */}
            {(questionType === 'TRUE_FALSE_NG' || questionType === 'YES_NO_NG') && (
                <div className="flex flex-col gap-1.5 ml-8 mt-1">
                    {(questionType === 'TRUE_FALSE_NG' ? ['TRUE', 'FALSE', 'NOT GIVEN'] : ['YES', 'NO', 'NOT GIVEN']).map(opt => (
                        <label key={opt} className="flex items-center gap-2 cursor-pointer group">
                            <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-all ${answers[q.id] === opt ? 'border-indigo-600 bg-indigo-600' : 'border-slate-300 group-hover:border-indigo-400'}`}>
                                {answers[q.id] === opt && <div className="w-2 h-2 bg-white rounded-full"></div>}
                            </div>
                            <input 
                                type="radio" 
                                name={`q-${q.id}`} 
                                value={opt} 
                                checked={answers[q.id] === opt} 
                                onChange={(e) => onAnswerChange(q.id, e.target.value)} 
                                className="hidden"
                            />
                            <span className="text-sm font-medium text-slate-700">{opt}</span>
                        </label>
                    ))}
                </div>
            )}
        </div>
    );
  };

  const renderGroupHeader = (group: QuestionGroup, startIdx: number, endIdx: number) => {
     const typeLabels: Record<string, string> = {
         'MCQ': 'MULTIPLE CHOICE',
         'FILL_IN_BLANKS': 'SENTENCE COMPLETION',
         'NOTES_COMPLETION': 'NOTES COMPLETION',
         'TRUE_FALSE_NG': 'TRUE / FALSE / NG',
         'YES_NO_NG': 'YES / NO / NG',
         'MATCHING_HEADINGS': 'MATCHING HEADINGS',
         'MATCHING_FEATURES': 'MATCHING FEATURES',
         'MATCHING_INFORMATION': 'MATCHING INFORMATION',
         'MATCHING_SENTENCE_ENDINGS': 'MATCHING SENTENCE ENDINGS'
     };
     // Fix: handle missing type safely
     const safeType = group.type || 'UNKNOWN';
     const label = typeLabels[safeType] || safeType.replace(/_/g, ' ');

     return (
         <div className="mb-4 bg-slate-800 text-slate-200 p-4 rounded-sm border-l-4 border-indigo-500 shadow-sm">
             <div className="flex justify-between items-start mb-2">
                 <h3 className="font-bold text-white text-lg">Questions {startIdx + 1} - {endIdx + 1}</h3>
                 <span className="text-xs font-bold bg-slate-700 px-2 py-1 rounded text-slate-300 uppercase">{label}</span>
             </div>
             
             <p className="text-sm italic text-slate-400 mb-3">{group.instruction}</p>

             {group.type === 'TRUE_FALSE_NG' && (
                 <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm bg-slate-900/50 p-3 rounded mt-3">
                     <span className="font-bold text-indigo-400">TRUE</span>
                     <span>if the statement agrees with the information</span>
                     <span className="font-bold text-indigo-400">FALSE</span>
                     <span>if the statement contradicts the information</span>
                     <span className="font-bold text-indigo-400">NOT GIVEN</span>
                     <span>if there is no information on this</span>
                 </div>
             )}

             {group.type === 'YES_NO_NG' && (
                 <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm bg-slate-900/50 p-3 rounded mt-3">
                     <span className="font-bold text-indigo-400">YES</span>
                     <span>if the statement agrees with the views of the writer</span>
                     <span className="font-bold text-indigo-400">NO</span>
                     <span>if the statement contradicts the views of the writer</span>
                     <span className="font-bold text-indigo-400">NOT GIVEN</span>
                     <span>if it is impossible to say what the writer thinks about this</span>
                 </div>
             )}
         </div>
     );
  };

  const isReading = assignment.type === AssignmentType.READING;
  const isListening = assignment.type === AssignmentType.LISTENING;
  const isWriting = assignment.type === AssignmentType.WRITING;

  let allQuestions: Question[] = [];
  if (assignment.questionGroups) {
      allQuestions = assignment.questionGroups.flatMap(g => g.questions);
  } else if (assignment.questions) {
      allQuestions = assignment.questions;
  }

  return (
    <div className={`bg-white flex flex-col ${isReading || isWriting ? 'h-screen overflow-hidden' : 'min-h-screen'}`}>
        
        {/* Anti-Cheat Warning Toast */}
        {showWarning && (
            <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[60] bg-red-600 text-white px-6 py-3 rounded-lg shadow-xl animate-in fade-in slide-in-from-top-5 flex items-center gap-3">
                <AlertTriangle size={24} className="animate-pulse" />
                <span className="font-bold">{showWarning}</span>
            </div>
        )}

        {/* Top Header */}
        <div className="bg-white border-b sticky top-0 z-20 shadow-sm shrink-0">
           <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
              <div className="flex items-center gap-4">
                 <button onClick={onExit} className="text-slate-500 hover:text-slate-900 flex items-center gap-1 font-medium">
                    &larr; {isTeacherPreview ? 'Close Preview' : 'Exit'}
                 </button>
                 <div className="h-6 w-px bg-slate-200"></div>
                 <h1 className="text-xl font-bold text-slate-900 truncate max-w-md">
                     {isTeacherPreview ? `[Preview] ${assignment.title}` : assignment.title}
                 </h1>
              </div>
              <div className="flex items-center gap-4">
                 
                 {/* TIMER DISPLAY */}
                 {timeLeft !== null && (
                     <div className={`text-base font-mono font-bold flex items-center gap-2 px-3 py-1.5 rounded border ${timeLeft < 120 ? 'bg-red-50 text-red-600 border-red-200 animate-pulse' : 'bg-slate-50 text-slate-700 border-slate-200'}`}>
                        <Clock size={18} /> 
                        {formatTime(timeLeft)}
                     </div>
                 )}
                 {!assignment.timeLimit && !isTeacherPreview && (
                     <div className="text-sm font-medium text-slate-500 flex items-center gap-2 hidden md:flex">
                        <Clock size={16} /> Untimed
                     </div>
                 )}

                 <button 
                    onClick={handleSubmit} 
                    disabled={isSubmitting}
                    className="bg-indigo-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-indigo-700 shadow-sm disabled:opacity-50 text-sm md:text-base"
                  >
                    {isSubmitting ? 'Processing...' : (isTeacherPreview ? 'Finish Preview' : 'Submit All')}
                  </button>
              </div>
           </div>
        </div>

        {/* READING SPLIT SCREEN */}
        {isReading && (
          <div className="flex-1 flex overflow-hidden relative">
            <div className="w-1/2 h-full overflow-y-auto border-r border-slate-200 bg-slate-50 p-6 pb-24">
               <div className="max-w-2xl mx-auto">
                  {assignment.passageContent ? (
                    <div 
                        className="prose prose-slate max-w-none text-base leading-relaxed text-slate-800"
                        dangerouslySetInnerHTML={{ __html: assignment.passageContent }}
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                      <BookOpen size={48} className="mb-4 opacity-50"/>
                      <p>No reading passage content provided.</p>
                    </div>
                  )}
               </div>
            </div>

            <div className="w-1/2 h-full overflow-y-auto bg-white p-6 relative pb-32">
               <div className="max-w-2xl mx-auto">
                  {assignment.questionGroups && assignment.questionGroups.length > 0 ? (
                      <div>
                          {(() => {
                              let globalCounter = 0;
                              return assignment.questionGroups.map((group) => {
                                  const startIdx = globalCounter;
                                  const endIdx = globalCounter + group.questions.length - 1;
                                  
                                  const groupContent = (
                                      <div key={group.id} className="mb-8 border-b border-slate-100 pb-6 last:border-0">
                                          {renderGroupHeader(group, startIdx, endIdx)}
                                          
                                          {group.type === 'MATCHING_HEADINGS' && group.headingList && (
                                              <div className="border border-slate-300 rounded-lg p-5 mb-6 bg-white shadow-sm">
                                                  <h4 className="font-bold text-slate-900 mb-3 border-b pb-2">List of Headings</h4>
                                                  <ul className="space-y-2">
                                                      {group.headingList.map((h, i) => (
                                                          <li key={i} className="text-base text-slate-800 flex gap-3 leading-relaxed">
                                                              <span className="font-bold text-indigo-600 min-w-[24px] text-right">{toRoman(i+1)}</span>
                                                              <span>{h}</span>
                                                          </li>
                                                      ))}
                                                  </ul>
                                              </div>
                                          )}

                                          {(group.type === 'MATCHING_FEATURES' || group.type === 'MATCHING_SENTENCE_ENDINGS') && group.matchOptions && (
                                              <div className="border border-slate-300 rounded-lg p-5 mb-6 bg-white shadow-sm">
                                                  <h4 className="font-bold text-slate-900 mb-3 border-b pb-2">
                                                      {group.type === 'MATCHING_SENTENCE_ENDINGS' ? 'List of Endings' : 'List of Options'}
                                                  </h4>
                                                  <ul className="space-y-2">
                                                      {group.matchOptions.map((opt, i) => (
                                                          <li key={i} className="text-base text-slate-800 flex gap-3 leading-relaxed">
                                                              <span className="font-bold text-indigo-600 min-w-[24px] text-right">{toLetter(i)}</span>
                                                              <span>{opt}</span>
                                                          </li>
                                                      ))}
                                                  </ul>
                                              </div>
                                          )}

                                          <div className="pl-2">
                                            {group.type === 'NOTES_COMPLETION' && group.content ? (
                                                (() => {
                                                    const currentStart = globalCounter;
                                                    globalCounter += group.questions.length;
                                                    return (
                                                        <NotesCompletionRenderer 
                                                            content={group.content}
                                                            questions={group.questions}
                                                            startGlobalIndex={currentStart}
                                                            answers={answers}
                                                            onAnswerChange={onAnswerChange}
                                                        />
                                                    );
                                                })()
                                            ) : (
                                                group.questions.map((q, qIdx) => {
                                                    const currentGlobalIndex = globalCounter;
                                                    globalCounter++;
                                                    return renderSingleQuestion(q, qIdx, currentGlobalIndex, group);
                                                })
                                            )}
                                          </div>
                                      </div>
                                  );
                                  return groupContent;
                              });
                          })()}
                      </div>
                  ) : (
                      <p className="text-slate-500 italic">No questions configured.</p>
                  )}
               </div>
            </div>

            <div className="absolute bottom-0 left-0 right-0 bg-white border-t border-slate-200 shadow-[0_-4px_10px_rgba(0,0,0,0.05)] z-30 px-6 py-3">
                <div className="max-w-7xl mx-auto flex items-center gap-4 overflow-x-auto pb-1 custom-scrollbar">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider shrink-0 mr-2">Navigator</span>
                    {allQuestions.map((q, idx) => {
                        const isAnswered = !!answers[q.id];
                        return (
                            <button 
                                key={q.id}
                                onClick={() => scrollToQuestion(idx)}
                                className={`
                                    w-8 h-8 rounded shrink-0 flex items-center justify-center text-xs font-bold transition-all
                                    ${isAnswered 
                                        ? 'bg-indigo-600 text-white shadow-sm' 
                                        : 'bg-slate-100 text-slate-500 hover:bg-indigo-50 hover:text-indigo-600'
                                    }
                                `}
                            >
                                {idx + 1}
                            </button>
                        );
                    })}
                </div>
            </div>
          </div>
        )}

        {/* WRITING SPLIT SCREEN */}
        {isWriting && (
            <div className="flex-1 flex overflow-hidden">
                <div className="w-1/2 h-full overflow-y-auto bg-slate-50 border-r border-slate-200 p-8">
                    <div className="max-w-xl mx-auto">
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 mb-6">
                            <div className="flex items-center gap-2 mb-4">
                                <span className="text-xs font-bold bg-indigo-100 text-indigo-700 px-2 py-1 rounded uppercase">
                                    {assignment.writingTaskType === 'TASK_1' ? 'IELTS Task 1' : 'IELTS Task 2'}
                                </span>
                            </div>
                            <h3 className="font-bold text-lg text-slate-900 mb-4">
                                {assignment.writingTaskType === 'TASK_1' 
                                    ? "Summarise the information by selecting and reporting the main features, and make comparisons where relevant."
                                    : "Write an essay in response to the following prompt."}
                            </h3>
                            <div className="prose prose-slate max-w-none text-slate-700 leading-relaxed mb-6">
                                {assignment.writingPrompt}
                            </div>
                            
                            {assignment.writingTaskType === 'TASK_1' && assignment.writingImage && (
                                <div className="mt-6 border rounded-lg overflow-hidden">
                                    <img 
                                        src={`data:image/png;base64,${assignment.writingImage}`} 
                                        alt="Task 1 Graph" 
                                        className="w-full object-contain bg-white"
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="w-1/2 h-full flex flex-col bg-white relative">
                    {/* Anti-Cheat Overlay Hint */}
                    <div className="absolute top-0 right-0 p-2 z-10 flex gap-2">
                        <div className="text-[10px] text-slate-400 flex items-center gap-1 bg-slate-50 px-2 py-1 rounded border border-slate-100" title="Tab switching and Copy/Paste are monitored">
                            <ShieldAlert size={12} /> Proctored Mode
                        </div>
                    </div>

                    <div className="flex-1 p-8 overflow-y-auto relative">
                        <textarea 
                            className="w-full h-full resize-none outline-none text-lg leading-relaxed text-slate-800 placeholder:text-slate-300 bg-white"
                            placeholder="Start typing your essay here..."
                            value={answers['essay'] || ''}
                            onChange={(e) => onAnswerChange('essay', e.target.value)}
                            onPaste={handlePaste}
                            spellCheck={false}
                        />
                    </div>
                    <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-between items-center text-sm font-medium text-slate-500">
                        <div className="flex items-center gap-4">
                             <span className="flex items-center gap-2">
                                <PenTool size={16} /> 
                                Word Count: <span className="text-indigo-600 font-bold">{getWordCount(answers['essay'] || '')}</span>
                             </span>
                             {assignment.writingTaskType === 'TASK_1' && (
                                 <span className={getWordCount(answers['essay'] || '') < 150 ? 'text-red-500' : 'text-green-600'}>
                                     (Min: 150)
                                 </span>
                             )}
                             {assignment.writingTaskType === 'TASK_2' && (
                                 <span className={getWordCount(answers['essay'] || '') < 250 ? 'text-red-500' : 'text-green-600'}>
                                     (Min: 250)
                                 </span>
                             )}
                        </div>
                    </div>
                </div>
            </div>
        )}

        {/* LISTENING STICKY PLAYER */}
        {isListening && assignment.videoUrl && (
          <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 p-4 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] z-50">
             <div className="max-w-3xl mx-auto flex items-center gap-4">
                <div className="bg-indigo-100 p-2 rounded-full text-indigo-600">
                   <Headphones size={24} />
                </div>
                <div className="flex-1">
                   <p className="text-xs font-bold text-slate-500 uppercase mb-1">Audio Track</p>
                   <audio controls src={assignment.videoUrl} className="w-full h-10" controlsList="nodownload" />
                </div>
             </div>
          </div>
        )}
    </div>
  );
}
