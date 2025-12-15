import { IsIn, IsOptional, IsString } from 'class-validator';
import type { TaskStatus } from '../task.interface';

export class FilterTasksDto {
  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsIn(['open', 'in_progress', 'done'])
  status?: TaskStatus;
}
