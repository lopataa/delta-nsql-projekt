import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { JwtAuthGuard } from '../auth/auth.guard';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { FilterTasksDto } from './dto/filter-tasks.dto';
import { SafeUser } from '../auth/user.interface';
import { Request } from 'express';

interface RequestWithUser extends Request {
  user?: SafeUser;
}

@Controller('tasks')
@UseGuards(JwtAuthGuard)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get()
  list(@Req() req: RequestWithUser, @Query() query: FilterTasksDto) {
    return this.tasksService.list(req.user!.id, query);
  }

  @Post()
  create(@Req() req: RequestWithUser, @Body() payload: CreateTaskDto) {
    return this.tasksService.create(req.user!.id, payload);
  }

  @Put(':id')
  update(@Req() req: RequestWithUser, @Param('id') id: string, @Body() payload: UpdateTaskDto) {
    return this.tasksService.update(req.user!.id, id, payload);
  }

  @Delete(':id')
  remove(@Req() req: RequestWithUser, @Param('id') id: string) {
    return this.tasksService.remove(req.user!.id, id);
  }
}
