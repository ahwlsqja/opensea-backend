import { Controller, Get, Param } from '@nestjs/common';
import { NftService } from './nft.service';

@Controller('nft')
export class NftController {
    constructor(private nftService: NftService) {}

    @Get('/contract/:address')
    async getContractMetadata(@Param() param) {
        const { address } = param;
        return this.nftService.getNftContract(address)
    }
}
