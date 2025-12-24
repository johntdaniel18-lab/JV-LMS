
export enum UserRole {
  TEACHER = 'TEACHER',
  STUDENT = 'STUDENT',
}

export enum AssignmentType {
  READING = 'READING',
  LISTENING = 'LISTENING',
  WRITING = 'WRITING',
  SPEAKING = 'SPEAKING',
}

export interface Question {
  id: string;
  text: string;
  type: 'MCQ' | 'ESSAY' | 'SPEAKING' | 'WRITING_GENERAL' | 'WRITING_TASK_1' | 'WRITING_TASK_2' | 'FILL_IN_BLANKS' | 'NOTES_COMPLETION' | 'TRUE_FALSE_NG' | 'YES_NO_NG' | 'MATCHING_HEADINGS' | 'MATCHING_FEATURES' | 'MATCHING_INFORMATION' | 'MATCHING_SENTENCE_ENDINGS';
  options?: string[]; // For MCQ
  correctAnswer?: string; // For MCQ/Fill in blanks
  maxSelection?: number; // For MCQ (Multiple answers)
  attachmentUrl?: string; // For Task 1 Image
  minWordCount?: number;
}

// New Interface for Question Groups (e.g. Questions 1-5)
export interface QuestionGroup {
  id: string;
  type: 'MCQ' | 'FILL_IN_BLANKS' | 'NOTES_COMPLETION' | 'TRUE_FALSE_NG' | 'YES_NO_NG' | 'MATCHING_HEADINGS' | 'MATCHING_FEATURES' | 'MATCHING_INFORMATION' | 'MATCHING_SENTENCE_ENDINGS' | 'MIXED';
  title?: string; // e.g. "Questions 1-7"
  instruction: string; // e.g. "Choose the correct letter, A, B, C or D"
  content?: string; // HTML content for notes/summary completion
  headingList?: string[]; // List of headings for Matching Headings task
  matchOptions?: string[]; // List of options for Matching Features (e.g. Researchers) or Sentence Endings
  questions: Question[];
}

// New Interface for Assignment Groups (Folders)
export interface AssignmentGroup {
  id: string;
  classId: string;
  title: string; // e.g. "Homework Week 1"
  description?: string;
  createdAt: string;
  order?: number; // Added for drag-and-drop sorting
}

export interface AssignmentSection {
  id: string;
  title: string;
  description?: string;
  questions: Question[];
}

export interface Assignment {
  id: string;
  classId: string;
  groupId?: string; // Link to AssignmentGroup (Folder)
  title: string;
  type: AssignmentType;
  description: string;
  dueDate: string;
  timeLimit?: number; // Time limit in minutes

  // Reading Specific
  passageContent?: string; 
  questionGroups?: QuestionGroup[]; 

  // Listening Specific
  videoUrl?: string; 
  
  // Writing Specific
  writingTaskType?: 'TASK_1' | 'TASK_2';
  writingPrompt?: string;
  writingImage?: string; // Base64 for Task 1 Chart

  // Legacy/Other
  questions?: Question[]; 
  sections?: AssignmentSection[]; 
  content?: string; 
}

export interface QuestionResult {
  questionId: string;
  isCorrect: boolean;
  studentAnswer: string;
  correctAnswer: string;
}

export type SubmissionReport = Record<string, QuestionResult>;

export interface WritingCriteria {
  score: number;
  comment: string;
}

export interface WritingFeedback {
  overallBand: number;
  criteria: {
    taskAchievement: WritingCriteria; // or Task Response for Task 2
    coherenceCohesion: WritingCriteria;
    lexicalResource: WritingCriteria;
    grammaticalRange: WritingCriteria;
  };
  correctedEssay: string; // HTML string with <mark> tags or similar
  generalComment: string;
}

export interface SubmissionMetadata {
  tabSwitches: number;
  pasteAttempts: number;
}

export interface Submission {
  id: string;
  assignmentId: string;
  studentId: string;
  studentName: string;
  answers: Record<string, string>; // questionId -> answer text or audio base64
  status: 'SUBMITTED' | 'GRADED';
  grade?: string; // Band score
  feedback?: string;
  transcription?: string; // For Speaking tasks
  report?: SubmissionReport; // Detailed auto-grading report
  aiWritingFeedback?: WritingFeedback; // For Writing Tasks
  metadata?: SubmissionMetadata; // Integrity data
}

export interface ClassGroup {
  id: string;
  name: string;
  schedule: string;
  description?: string;
}

export interface User {
  id: string;
  role: UserRole;
  name: string;
  accessCode?: string; // For students
  enrolledClassIds?: string[]; // For students to track class enrollment
}

export interface Session {
  id: string;
  classId: string;
  title: string;
  description?: string;
}

export interface Material {
  id: string;
  sessionId: string;
  title: string;
  type: 'LINK' | 'VIDEO' | 'FILE';
  url: string;
}

export interface CalendarEvent {
  id: string;
  classId: string;
  title: string;
  date: string; // YYYY-MM-DD
  startTime?: string; // HH:MM
  endTime?: string; // HH:MM
  type: 'CLASS' | 'EXAM' | 'DEADLINE' | 'HOLIDAY';
}