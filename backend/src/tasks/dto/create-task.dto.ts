import { IsNotEmpty, IsOptional, MaxLength } from 'class-validator';

export class CreateTaskDto {
  @IsNotEmpty()
  @MaxLength(120)
  title: string;

  @IsOptional()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @MaxLength(60)
  category?: string;
}
