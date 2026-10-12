import { Injectable } from '@nestjs/common'
import { TaskLivenessResponseDto } from '@/dto/task-response.dto'

@Injectable()
export class AppService {
    /**Task 服务欢迎信息。*/
    public async httpBaseTaskWelcome(): Promise<string> {
        return 'Hello World!'
    }

    /**Task 服务进程存活状态。*/
    public async httpBaseTaskLiveness(): Promise<TaskLivenessResponseDto> {
        return { status: 'UP' }
    }
}
