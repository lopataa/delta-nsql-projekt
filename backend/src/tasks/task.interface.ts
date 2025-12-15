export type TaskStatus = 'open' | 'in_progress' | 'done';

export interface Task {
  id: string;
  userId: string;
  title: string;
  description?: string;
  category?: string;
  status: TaskStatus;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
}
