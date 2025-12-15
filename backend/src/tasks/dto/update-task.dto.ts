import { IsIn, IsOptional, MaxLength } from 'class-validator';
import type { TaskStatus } from '../task.interface';

export class UpdateTaskDto {
  @IsOptional()
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @MaxLength(60)
  category?: string;

  @IsOptional()
  @IsIn(['open', 'in_progress', 'done'])
  status?: TaskStatus;
}
