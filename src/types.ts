export type UserRole = 'admin' | 'student';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  createdAt: string;
}

export type QuestionType = 'objective' | 'subjective' | 'coding';

export interface TestCase {
  input: string;
  expectedOutput: string;
}

export interface Question {
  id: string;
  type: QuestionType;
  text: string;
  options?: string[];
  correctAnswer?: string;
  points: number;
  testCases?: TestCase[];
}

export interface Exam {
  id: string;
  title: string;
  description: string;
  code: string;
  creatorId: string;
  startTime: string;
  duration: number;
  questions: Question[];
  isActive: boolean;
}

export interface Warning {
  type: string;
  timestamp: string;
  message: string;
}

export interface Evidence {
  timestamp: string;
  image: string;
  reason: string;
}

export interface Submission {
  id: string;
  examId: string;
  studentId: string;
  studentName: string;
  studentEmail?: string;
  status: 'active' | 'submitted' | 'terminated';
  answers: Record<string, string>;
  warnings: Warning[];
  logs: string[];
  score?: number;
  verified: boolean;
  evidence?: Evidence[];
}
