import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { UserService } from './user.service';

@Controller('user')
export class UserController {
    constructor(private userService: UserService) {}
    
    @UseGuards(JwtAuthGuard)
    @Get('me')
    async getMe(@Request() req) {
        const userId = req.user.userId;

        return this.userService.getUser(userId);
    }
}
