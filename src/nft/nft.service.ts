import { HttpService } from '@nestjs/axios';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Nft, NftContract } from 'src/entities';
import { Repository } from 'typeorm';
import { catchError, from, mergeMap, of } from 'rxjs'

@Injectable()
export class NftService {
    private readonly alchemyEndpoint: string;
    private readonly alchemyApiKey: string;
    constructor(
        private configService: ConfigService,
        private httpService: HttpService,
        @InjectRepository(Nft)
        private nftRepository: Repository<Nft>,
        @InjectRepository(NftContract)
        private nftContractRepository: Repository<NftContract>,
    ){
        this.alchemyEndpoint = configService.get('ALCHEMY_ENDPOINT')
        this.alchemyApiKey =configService.get('ALCHEMY_API_KEY')
    }

    getNftContract(contractAddress: string){
        return from (
            this.nftContractRepository.findOne({
                where: {
                    contractAddress,
                }
            }),
        ).pipe(
          mergeMap((nftContract) => {
            if(nftContract) {
                return of(nftContract)
            }

            return this.httpService.get(
                `/nft/v2/${this.alchemyApiKey}/getContractMetadata`,
                {
                    baseURL: this.alchemyEndpoint,
                    params: {
                        contractAddress,
                    },
                },
            ).pipe(
                catchError(() => {
                    throw new HttpException('not NFT contract', HttpStatus.NOT_FOUND)
                }),
                mergeMap((result) => {
                    const contractMetadata = result.data.contractMetadata;
                    
                    if (contractMetadata.tokenType != 'ERC721') {
                        throw new HttpException('not erc721', HttpStatus.NOT_FOUND);
                    }

                    const nftContract = new NftContract();
                    nftContract.contractAddress = contractAddress;
                    nftContract.name = contractMetadata.name;
                    nftContract.description = contractMetadata.openSea?.description;
                    nftContract.symbol = contractMetadata.symbol;
                    nftContract.synced = false;
                    nftContract.image = contractMetadata.openSea?.imageUrl;
                    nftContract.totalSupply = contractMetadata.totalSupply;

                    return from(this.nftContractRepository.save(nftContract));
                }),
            );
          })
        );
    }
}
