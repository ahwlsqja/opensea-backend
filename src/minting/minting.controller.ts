import { Body, Request, Controller, Post, UseGuards } from '@nestjs/common';
import { MintingService } from './minting.service';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';

@Controller('minting')
export class MintingController {
    constructor(private mintingService: MintingService) { }

    @UseGuards(JwtAuthGuard)
    @Post()
    async mintLazy(@Body() body, @Request() request) {
        const { address } = request.user;
        const { name, image, description, properties } = body;

        const token = await this.mintingService.generateNftLazy({ address, name, image, description, attributes: properties });

        return {
            ...token,
            properties: token.properties.map((v) => ({
                trait_type: v.propertyKey,
                value: v.value,
            })),
        };
    }
}
