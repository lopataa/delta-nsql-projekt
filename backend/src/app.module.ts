import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from './auth/auth.module';
import { TasksModule } from './tasks/tasks.module';
import { TasksGateway } from './events/tasks.gateway';

@Module({
  imports: [RedisModule, AuthModule, TasksModule],
  controllers: [AppController],
  providers: [AppService, TasksGateway],
})
export class AppModule {}
