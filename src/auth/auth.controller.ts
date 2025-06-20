import { Body, Controller, Get, HttpException, HttpStatus, Param, Post } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
    constructor(private authService: AuthService) { }

    @Get(':address')
    async getSignMessage(@Param() params) {
        const address = params.address;

        if (!/^[0-9a-fA-F]{40}$/.test(address)) {
            throw new HttpException('Wrong address', HttpStatus.BAD_REQUEST);
        }

        const authRequest = await this.authService.generateAuthRequest(address);

        return {
            id: authRequest.id,
            message: this.authService.genereateSignatureMessage(authRequest),
            expiredAt: authRequest.expiredAt,
        }
    }

    @Post('verify')
    async verifySignMessage(@Body() body) {
        const { signature, id } = body;

        return this.authService.verifyAuthRequest(id, signature);
    }
}
